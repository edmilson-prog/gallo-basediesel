import type { CarteiraTransferType, ICarteiraTransfer, ID } from "@/shared/types";
import type {
  ICreateTransferInput,
  IListTransfersParams,
  ITransfersProvider,
} from "../../contracts/transfers";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { fetchLargePage } from "./_pagination";
import { recordAuditLog } from "../../auditLogger";

/**
 * Supabase implementation of {@link ITransfersProvider} (PRD-120+).
 *
 * snake_case `carteira_transfers` table ↔ camelCase {@link ICarteiraTransfer}
 * via `rowToTransfer`. The row itself is audit-style: once created it only
 * changes `status` (active → reverted/expired), so there is no generic patch
 * mapper — `revert`/`expire` flip a single column.
 *
 * A transfer is NOT only that row, though: creating it moves the listed
 * customers to the destination seller, and reverting/expiring moves them back.
 * The mock backend has always done both halves (`reassignCustomers` in
 * `mocks/api/transfers.ts`); this provider must match, otherwise a
 * "successful" transfer silently leaves the customer with the old seller.
 *
 * Both halves are separate requests — Postgres has no transaction spanning two
 * PostgREST calls — so each mutation compensates on failure (delete the fresh
 * transfer / restore the previous status) instead of leaving a transfer whose
 * effect never landed.
 *
 * Each mutation also records an `audit_logs` entry (`transfer.create/.revert/
 * .expire`, resource `transfer`) — the mock backend has always done this via
 * `logMockMutation`; this provider previously didn't, leaving the "Auditoria"
 * tab permanently empty and the "Histórico" tab's "Executado por"/"Encerrado
 * em" columns bound to `created_by`/`created_at` (who/when it was CREATED,
 * mislabeled as who/when it was CLOSED — `carteira_transfers` itself has no
 * closedBy/closedAt columns). The audit trail is the actual source of truth
 * for closure attribution; the UI now derives it from here instead.
 *
 * `revert`'s actor comes from the caller (a human clicking "Reverter"); recorded
 * fire-and-forget-safe via `recordAuditLog`, which never throws — a logging
 * failure must not undo a mutation that already succeeded. `expire`'s actor is
 * optional because the auto-revert timer has no human actor to attribute it
 * to, and `audit_logs.actor_id` is a NOT NULL FK to sellers — there is no
 * honest "system" value to fall back to, so that entry is simply skipped
 * rather than fabricated.
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

/**
 * Max customer ids per reassignment request. `.in()` serializes the whole list
 * into the query string, so a large batch transfer would blow past the URL
 * limit and come back as an opaque 400.
 */
const REASSIGN_CHUNK_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Points `customerIds` at `toSellerId`.
 *
 * `onlyCurrentSellerId` narrows the update to customers still owned by that
 * seller — used when undoing a transfer, so a customer that was transferred
 * onward (A → B → C) is not yanked back to A by reverting the first hop.
 *
 * Returns the ids actually moved, so the caller can compensate precisely.
 */
async function reassignCustomers(
  customerIds: ID[],
  toSellerId: ID,
  onlyCurrentSellerId?: ID,
): Promise<{ moved: ID[]; error: string | null }> {
  const moved: ID[] = [];
  for (const ids of chunk(customerIds, REASSIGN_CHUNK_SIZE)) {
    let query = getSupabaseClient()
      .from("customers")
      .update({ seller_id: toSellerId })
      .in("id", ids);
    if (onlyCurrentSellerId !== undefined) query = query.eq("seller_id", onlyCurrentSellerId);

    const { data, error } = await query.select("id");
    if (error) return { moved, error: error.message };
    moved.push(...((data ?? []) as { id: ID }[]).map((r) => r.id));
  }
  return { moved, error: null };
}

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
    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
      if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
      if (params.fromSellerId !== undefined)
        query = query.eq("from_seller_id", params.fromSellerId);
      if (params.toSellerId !== undefined) query = query.eq("to_seller_id", params.toSellerId);

      if (params.statuses && params.statuses.length > 0) {
        query = query.in("status", params.statuses);
      } else if (params.status !== undefined) {
        query = query.eq("status", params.status);
      }

      if (params.types && params.types.length > 0) query = query.in("type", params.types);
      if (params.since !== undefined) query = query.gte("start_date", params.since);
      if (params.until !== undefined) query = query.lte("start_date", params.until);
      return query;
    };

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    const { data, total } = await fetchLargePage<TransferRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order("start_date", { ascending: false })
          .order("id", { ascending: true })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] transfers.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as TransferRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToTransfer),
      total,
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
    // The three seller columns are uuid FKs to sellers(id). Callers must hand
    // over ISeller.ids — never the auth user id (a different value, which the
    // `created_by` constraint rejects as an opaque 409) and never the "" that
    // an ownerless customer collapses into (which the uuid cast rejects).
    if (!input.createdBy) {
      throw new Error("[supabase] transfers.create failed: createdBy is required");
    }
    if (!input.fromSellerId) {
      throw new Error("[supabase] transfers.create failed: fromSellerId is required");
    }
    if (!input.toSellerId) {
      throw new Error("[supabase] transfers.create failed: toSellerId is required");
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

    // Second half: the customers actually change hands. On failure undo what
    // landed, so the user retries from a clean state instead of accumulating
    // transfers that never took effect.
    const { moved, error: reassignError } = await reassignCustomers(
      input.customerIds,
      input.toSellerId,
    );
    if (reassignError) {
      if (moved.length > 0) await reassignCustomers(moved, input.fromSellerId);
      await getSupabaseClient().from(TABLE).delete().eq("id", id);
      throw new Error(`[supabase] transfers.create failed: ${reassignError}`);
    }

    const transfer = rowToTransfer(data as unknown as TransferRow);
    await recordAuditLog({
      actorId: input.createdBy,
      action: "transfer.create",
      resource: "transfer",
      resourceId: id,
      storeId: input.storeId,
      after: {
        type: input.type,
        fromSellerId: input.fromSellerId,
        toSellerId: input.toSellerId,
        customerCount: input.customerIds.length,
        reason: input.reason,
        endDate: input.endDate,
        autoRevertAt: transfer.autoRevertAt,
      },
    });

    return transfer;
  },

  async revert(transferId: ID, actorId?: ID): Promise<ICarteiraTransfer> {
    return undoTransfer(transferId, "reverted", actorId);
  },

  async expire(transferId: ID, actorId?: ID): Promise<ICarteiraTransfer> {
    return undoTransfer(transferId, "expired", actorId);
  },
};

/**
 * Shared body of `revert` and `expire`: both close an active transfer and hand
 * the customers back to the origin seller — they differ only in the status
 * recorded (manual reversal vs. the temporary transfer's auto-revert).
 *
 * The status flips first, guarded by `.eq("status", "active")`, so two tabs
 * racing the auto-revert timer cannot both reassign.
 */
async function undoTransfer(
  transferId: ID,
  status: "reverted" | "expired",
  actorId: ID | undefined,
): Promise<ICarteiraTransfer> {
  const { data, error } = await getSupabaseClient()
    .from(TABLE)
    .update({ status })
    .eq("id", transferId)
    .eq("status", "active")
    .select(COLUMNS)
    .single();
  const op = status === "reverted" ? "revert" : "expire";
  if (error) throw new Error(`[supabase] transfers.${op}(${transferId}) failed: ${error.message}`);

  const transfer = rowToTransfer(data as unknown as TransferRow);
  const { moved, error: reassignError } = await reassignCustomers(
    transfer.customerIds,
    transfer.fromSellerId,
    transfer.toSellerId,
  );
  if (reassignError) {
    if (moved.length > 0) await reassignCustomers(moved, transfer.toSellerId);
    await getSupabaseClient().from(TABLE).update({ status: "active" }).eq("id", transferId);
    throw new Error(`[supabase] transfers.${op}(${transferId}) failed: ${reassignError}`);
  }

  if (actorId) {
    await recordAuditLog({
      actorId,
      action: `transfer.${op}`,
      resource: "transfer",
      resourceId: transferId,
      storeId: transfer.storeId,
      before: { status: "active" },
      after: {
        status,
        fromSellerId: transfer.fromSellerId,
        toSellerId: transfer.toSellerId,
        customerCount: transfer.customerIds.length,
      },
    });
  }

  return transfer;
}
