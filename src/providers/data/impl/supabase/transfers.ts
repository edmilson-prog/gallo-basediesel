import type { CarteiraTransferType, ICarteiraTransfer, ID } from "@/shared/types";
import type {
  ICreateTransferInput,
  IListTransfersParams,
  ITransfersProvider,
} from "../../contracts/transfers";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link ITransfersProvider} (PRD-120+).
 *
 * snake_case `carteira_transfers` table ↔ camelCase {@link ICarteiraTransfer}
 * via `rowToTransfer`. Transfers are audit-style records: once created they only
 * change `status` (active → reverted/expired), so there is no generic patch
 * mapper — `revert`/`expire` flip a single column.
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (create/revert/expire) require the write policies that land with PRD-103.
 */

interface TransferRow {
  id: string;
  store_id: string;
  type: CarteiraTransferType;
  from_seller_id: string;
  to_seller_id: string;
  customer_ids: string[];
  reason: string;
  start_date: string;
  end_date: string | null;
  auto_revert_at: string | null;
  status: ICarteiraTransfer["status"];
  created_by: string;
  created_at: string;
}

const TABLE = "carteira_transfers";
const COLUMNS =
  "id, store_id, type, from_seller_id, to_seller_id, customer_ids, reason, start_date, " +
  "end_date, auto_revert_at, status, created_by, created_at";

function rowToTransfer(row: TransferRow): ICarteiraTransfer {
  return {
    id: row.id,
    storeId: row.store_id,
    type: row.type,
    fromSellerId: row.from_seller_id,
    toSellerId: row.to_seller_id,
    customerIds: row.customer_ids,
    reason: row.reason,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    autoRevertAt: row.auto_revert_at ?? undefined,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export const supabaseTransfersProvider: ITransfersProvider = {
  async list(params: IListTransfersParams = {}): Promise<IPaginatedResult<ICarteiraTransfer>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
    if (params.fromSellerId !== undefined) query = query.eq("from_seller_id", params.fromSellerId);
    if (params.toSellerId !== undefined) query = query.eq("to_seller_id", params.toSellerId);

    if (params.statuses && params.statuses.length > 0) {
      query = query.in("status", params.statuses);
    } else if (params.status !== undefined) {
      query = query.eq("status", params.status);
    }

    if (params.types && params.types.length > 0) query = query.in("type", params.types);
    if (params.since !== undefined) query = query.gte("start_date", params.since);
    if (params.until !== undefined) query = query.lte("start_date", params.until);

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("start_date", { ascending: false })
      .range(from, to);

    if (error) throw new Error(`[supabase] transfers.list failed: ${error.message}`);

    return {
      data: (data as unknown as TransferRow[]).map(rowToTransfer),
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async create(input: ICreateTransferInput): Promise<ICarteiraTransfer> {
    if (input.customerIds.length === 0) {
      throw new Error("[supabase] transfers.create failed: customerIds is required");
    }
    if (input.fromSellerId === input.toSellerId) {
      throw new Error(
        "[supabase] transfers.create failed: fromSellerId must be different from toSellerId",
      );
    }
    if (input.type === "temporary" && !input.endDate) {
      throw new Error(
        "[supabase] transfers.create failed: endDate is required for temporary transfers",
      );
    }
    if (input.type === "temporary" && input.endDate && input.startDate) {
      if (new Date(input.endDate).getTime() <= new Date(input.startDate).getTime()) {
        throw new Error("[supabase] transfers.create failed: endDate must be after startDate");
      }
    }

    const id: ID = crypto.randomUUID();
    const now = new Date().toISOString();
    const row = {
      id,
      store_id: input.storeId,
      type: input.type,
      from_seller_id: input.fromSellerId,
      to_seller_id: input.toSellerId,
      customer_ids: input.customerIds,
      reason: input.reason,
      start_date: input.startDate ?? now,
      end_date: input.endDate ?? null,
      auto_revert_at: input.type === "temporary" ? (input.endDate ?? null) : null,
      status: "active",
      created_by: input.createdBy,
    };

    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(row)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] transfers.create failed: ${error.message}`);
    return rowToTransfer(data as unknown as TransferRow);
  },

  async revert(transferId: ID): Promise<ICarteiraTransfer> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ status: "reverted" })
      .eq("id", transferId)
      .eq("status", "active")
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] transfers.revert(${transferId}) failed: ${error.message}`);
    return rowToTransfer(data as unknown as TransferRow);
  },

  async expire(transferId: ID): Promise<ICarteiraTransfer> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ status: "expired" })
      .eq("id", transferId)
      .eq("status", "active")
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] transfers.expire(${transferId}) failed: ${error.message}`);
    return rowToTransfer(data as unknown as TransferRow);
  },
};
