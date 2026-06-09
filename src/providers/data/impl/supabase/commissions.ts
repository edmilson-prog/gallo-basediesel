import type {
  CommissionStatus,
  ICommission,
  ICommissionGoalSnapshot,
  ICommissionRuleConfig,
  ICommissionSplitDetails,
  ID,
} from "@/shared/types";
import type {
  ICloseMonthlyPeriodInput,
  ICommissionsProvider,
  ICreateCommissionInput,
  IListCommissionsParams,
  IOpenDisputeInput,
  IRegisterPaymentInput,
  IResolveDisputeInput,
} from "../../contracts/commissions";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link ICommissionsProvider} (PRD-047 / PRD-120+).
 *
 * snake_case `commissions` table ↔ camelCase {@link ICommission} via
 * `rowToCommission`. A commission has no line items (those live on the parent
 * order); the structured snapshots — `splitDetails`, `ruleSnapshot`,
 * `goalSnapshot` — are stored as jsonb columns and rehydrated verbatim, keeping
 * the immutable evidence captured at calculation time intact.
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (create/update/dispute/payment/close) require the write policies that land
 * with PRD-103.
 */

interface CommissionRow {
  id: string;
  store_id: string;
  seller_id: string;
  order_id: string;
  base_value: number;
  rate: number;
  base_rate: number;
  base_commission: number;
  goal_bonus: number;
  total_commission: number;
  value: number;
  is_split: boolean;
  split_details: ICommissionSplitDetails | null;
  rule_snapshot: ICommissionRuleConfig | null;
  goal_snapshot: ICommissionGoalSnapshot | null;
  period: string;
  closed_in_period: string | null;
  approved_at: string | null;
  approved_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  dispute_reason: string | null;
  disputed_at: string | null;
  dispute_resolution: string | null;
  dispute_resolved_by: string | null;
  dispute_resolved_at: string | null;
  status: CommissionStatus;
  notes: string | null;
  calculated_at: string;
  created_at: string;
  /** Embedded order number (PostgREST `order:orders(number)`) — list reads only. */
  order?: { number: string | null } | null;
}

const TABLE = "commissions";
const COLUMNS =
  "id, store_id, seller_id, order_id, base_value, rate, base_rate, base_commission, goal_bonus, " +
  "total_commission, value, is_split, split_details, rule_snapshot, goal_snapshot, period, " +
  "closed_in_period, approved_at, approved_by, paid_at, paid_by, dispute_reason, disputed_at, " +
  "dispute_resolution, dispute_resolved_by, dispute_resolved_at, status, notes, calculated_at, " +
  "created_at";

function rowToCommission(row: CommissionRow): ICommission {
  return {
    id: row.id,
    storeId: row.store_id,
    sellerId: row.seller_id,
    orderId: row.order_id,
    orderNumber: row.order?.number ?? undefined,
    baseValue: row.base_value,
    rate: row.rate,
    baseRate: row.base_rate,
    baseCommission: row.base_commission,
    goalBonus: row.goal_bonus,
    totalCommission: row.total_commission,
    value: row.value,
    isSplit: row.is_split,
    splitDetails: row.split_details ?? undefined,
    ruleSnapshot: row.rule_snapshot ?? undefined,
    goalSnapshot: row.goal_snapshot ?? undefined,
    period: row.period,
    closedInPeriod: row.closed_in_period ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    approvedBy: row.approved_by ?? undefined,
    paidAt: row.paid_at ?? undefined,
    paidBy: row.paid_by ?? undefined,
    disputeReason: row.dispute_reason ?? undefined,
    disputedAt: row.disputed_at ?? undefined,
    disputeResolution: row.dispute_resolution ?? undefined,
    disputeResolvedBy: row.dispute_resolved_by ?? undefined,
    disputeResolvedAt: row.dispute_resolved_at ?? undefined,
    status: row.status,
    notes: row.notes ?? undefined,
    calculatedAt: row.calculated_at,
    createdAt: row.created_at,
  };
}

/** Maps a camelCase patch to snake_case columns. `id`/`storeId`/`createdAt` are
 *  immutable and never written. */
function commissionPatchToRow(patch: Partial<ICommission>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.sellerId !== undefined) row.seller_id = patch.sellerId;
  if (patch.orderId !== undefined) row.order_id = patch.orderId;
  if (patch.baseValue !== undefined) row.base_value = patch.baseValue;
  if (patch.rate !== undefined) row.rate = patch.rate;
  if (patch.baseRate !== undefined) row.base_rate = patch.baseRate;
  if (patch.baseCommission !== undefined) row.base_commission = patch.baseCommission;
  if (patch.goalBonus !== undefined) row.goal_bonus = patch.goalBonus;
  if (patch.totalCommission !== undefined) row.total_commission = patch.totalCommission;
  if (patch.value !== undefined) row.value = patch.value;
  if (patch.isSplit !== undefined) row.is_split = patch.isSplit;
  if (patch.splitDetails !== undefined) row.split_details = patch.splitDetails;
  if (patch.ruleSnapshot !== undefined) row.rule_snapshot = patch.ruleSnapshot;
  if (patch.goalSnapshot !== undefined) row.goal_snapshot = patch.goalSnapshot;
  if (patch.period !== undefined) row.period = patch.period;
  if (patch.closedInPeriod !== undefined) row.closed_in_period = patch.closedInPeriod;
  if (patch.approvedAt !== undefined) row.approved_at = patch.approvedAt;
  if (patch.approvedBy !== undefined) row.approved_by = patch.approvedBy;
  if (patch.paidAt !== undefined) row.paid_at = patch.paidAt;
  if (patch.paidBy !== undefined) row.paid_by = patch.paidBy;
  if (patch.disputeReason !== undefined) row.dispute_reason = patch.disputeReason;
  if (patch.disputedAt !== undefined) row.disputed_at = patch.disputedAt;
  if (patch.disputeResolution !== undefined) row.dispute_resolution = patch.disputeResolution;
  if (patch.disputeResolvedBy !== undefined) row.dispute_resolved_by = patch.disputeResolvedBy;
  if (patch.disputeResolvedAt !== undefined) row.dispute_resolved_at = patch.disputeResolvedAt;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.calculatedAt !== undefined) row.calculated_at = patch.calculatedAt;
  return row;
}

/** Maps a create input onto a full insert row, including the immutable `id`. */
function createInputToRow(input: ICreateCommissionInput, id: string): Record<string, unknown> {
  return {
    id,
    store_id: input.storeId,
    seller_id: input.sellerId,
    order_id: input.orderId,
    base_value: input.baseValue,
    rate: input.rate,
    base_rate: input.baseRate,
    base_commission: input.baseCommission,
    goal_bonus: input.goalBonus,
    total_commission: input.totalCommission,
    value: input.value,
    is_split: input.isSplit,
    split_details: input.splitDetails ?? null,
    rule_snapshot: input.ruleSnapshot ?? null,
    goal_snapshot: input.goalSnapshot ?? null,
    period: input.period,
    closed_in_period: input.closedInPeriod ?? null,
    approved_at: input.approvedAt ?? null,
    approved_by: input.approvedBy ?? null,
    paid_at: input.paidAt ?? null,
    paid_by: input.paidBy ?? null,
    dispute_reason: input.disputeReason ?? null,
    disputed_at: input.disputedAt ?? null,
    dispute_resolution: input.disputeResolution ?? null,
    dispute_resolved_by: input.disputeResolvedBy ?? null,
    dispute_resolved_at: input.disputeResolvedAt ?? null,
    status: input.status,
    notes: input.notes ?? null,
    calculated_at: input.calculatedAt,
  };
}

export const supabaseCommissionsProvider: ICommissionsProvider = {
  async list(params: IListCommissionsParams = {}): Promise<IPaginatedResult<ICommission>> {
    let query = getSupabaseClient()
      .from(TABLE)
      .select(`${COLUMNS}, order:orders(number)`, { count: "exact" });

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);

    if (params.sellerIds && params.sellerIds.length > 0) {
      query = query.in("seller_id", params.sellerIds);
    } else if (params.sellerId !== undefined) {
      query = query.eq("seller_id", params.sellerId);
    }

    if (params.statuses && params.statuses.length > 0) {
      query = query.in("status", params.statuses);
    } else if (params.status !== undefined) {
      query = query.eq("status", params.status);
    }

    if (params.period !== undefined) query = query.eq("period", params.period);

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(200, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(`[supabase] commissions.list failed: ${error.message}`);

    return {
      data: (data as unknown as CommissionRow[]).map(rowToCommission),
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async create(input: ICreateCommissionInput): Promise<ICommission> {
    const id: ID = crypto.randomUUID();
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(createInputToRow(input, id))
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] commissions.create failed: ${error.message}`);
    return rowToCommission(data as unknown as CommissionRow);
  },

  async update(id: ID, patch: Partial<ICommission>): Promise<ICommission> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update(commissionPatchToRow(patch))
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] commissions.update(${id}) failed: ${error.message}`);
    return rowToCommission(data as unknown as CommissionRow);
  },

  async closeMonthlyPeriod(input: ICloseMonthlyPeriodInput): Promise<ICommission[]> {
    // Bulk-approve every `calculated` commission of the store/period and lock it
    // into the closing period. Mirrors the mock's table-backed step exactly.
    //
    // NOTE: the mock also appends `period` to `stores.settings.commissionSettings
    // .closedPeriods` as a bookkeeping side effect. That jsonb array lives in the
    // settings/stores domain, not on `commissions`; mutating it here would cross
    // provider boundaries and risk a lost-update race on the shared settings blob.
    // It is therefore left to the settings provider (the dashboard re-reads the
    // closed flag from the commission rows' `closed_in_period`, which IS set here).
    const now = new Date().toISOString();
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({
        status: "approved" as CommissionStatus,
        approved_at: now,
        approved_by: input.approvedBy,
        closed_in_period: input.period,
      })
      .eq("store_id", input.storeId)
      .eq("period", input.period)
      .eq("status", "calculated")
      .select(COLUMNS);
    if (error)
      throw new Error(`[supabase] commissions.closeMonthlyPeriod failed: ${error.message}`);
    return (data as unknown as CommissionRow[]).map(rowToCommission);
  },

  async openDispute(input: IOpenDisputeInput): Promise<ICommission> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({
        status: "disputed" as CommissionStatus,
        dispute_reason: input.reason,
        disputed_at: new Date().toISOString(),
      })
      .eq("id", input.commissionId)
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(
        `[supabase] commissions.openDispute(${input.commissionId}) failed: ${error.message}`,
      );
    return rowToCommission(data as unknown as CommissionRow);
  },

  async resolveDispute(input: IResolveDisputeInput): Promise<ICommission> {
    const now = new Date().toISOString();
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({
        status: input.finalStatus,
        dispute_resolution: input.resolution,
        dispute_resolved_by: input.actorId,
        dispute_resolved_at: now,
        approved_at: input.finalStatus === "approved" ? now : null,
        approved_by: input.finalStatus === "approved" ? input.actorId : null,
      })
      .eq("id", input.commissionId)
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(
        `[supabase] commissions.resolveDispute(${input.commissionId}) failed: ${error.message}`,
      );
    return rowToCommission(data as unknown as CommissionRow);
  },

  async registerPayment(input: IRegisterPaymentInput): Promise<ICommission> {
    // The mock guards that only `approved` commissions can be paid. Encode the
    // same precondition in the WHERE clause so a non-approved row matches nothing
    // and `.single()` surfaces an error instead of silently flipping the status.
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({
        status: "paid" as CommissionStatus,
        paid_at: input.paidAt ?? new Date().toISOString(),
        paid_by: input.paidBy,
      })
      .eq("id", input.commissionId)
      .eq("status", "approved")
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(
        `[supabase] commissions.registerPayment(${input.commissionId}) failed: ${error.message}`,
      );
    return rowToCommission(data as unknown as CommissionRow);
  },
};
