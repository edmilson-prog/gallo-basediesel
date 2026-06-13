import type { ID, ISO8601, IScheduledSend, ScheduledSendStatus } from "@/shared/types";
import type { IScheduledSendProvider } from "../../contracts/scheduledSend";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link IScheduledSendProvider} (PRD-027 D-15).
 *
 * snake_case `scheduled_sends` table ↔ camelCase {@link IScheduledSend} via
 * `rowToScheduledSend`. The `payload` discriminated union (asset/snippet/combo/
 * product) is stored verbatim as a single jsonb column. `created_by` is a plain
 * text actor id (polymorphic — seller or system) so it carries no FK.
 *
 * `scheduledFor`/`createdAt` are timestamptz; `status` defaults to `pending` at
 * the DB level so the create input (which omits it) inserts cleanly.
 *
 * `listDue` mirrors the mock engine `isDue` (scheduledFor <= now) by filtering
 * pending rows with `scheduled_for <= now` server-side.
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (create/update/cancel/markSent/markFailed) require the write policies that
 * land with PRD-103. The dispatch worker that actually fires due sends
 * (PRD-027 RNF-007) lives outside this CRUD surface — the contract only exposes
 * the table-backed state transitions, all implemented here.
 */

interface ScheduledSendRow {
  id: string;
  store_id: string;
  conversation_id: string;
  scheduled_for: string | null;
  payload: IScheduledSend["payload"];
  status: ScheduledSendStatus;
  failure_reason: string | null;
  created_by: string;
  created_at: string;
}

const TABLE = "scheduled_sends";
const COLUMNS =
  "id, store_id, conversation_id, scheduled_for, payload, status, failure_reason, " +
  "created_by, created_at";

function rowToScheduledSend(row: ScheduledSendRow): IScheduledSend {
  return {
    id: row.id,
    storeId: row.store_id,
    conversationId: row.conversation_id,
    scheduledFor: row.scheduled_for,
    payload: row.payload,
    status: row.status,
    failureReason: row.failure_reason ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/** Maps a camelCase patch to snake_case columns. `id`/`storeId`/`createdAt` are
 *  immutable and never written. */
function scheduledSendPatchToRow(patch: Partial<IScheduledSend>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.conversationId !== undefined) row.conversation_id = patch.conversationId;
  if (patch.scheduledFor !== undefined) row.scheduled_for = patch.scheduledFor;
  if (patch.payload !== undefined) row.payload = patch.payload;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.failureReason !== undefined) row.failure_reason = patch.failureReason;
  if (patch.createdBy !== undefined) row.created_by = patch.createdBy;
  return row;
}

export const supabaseScheduledSendProvider: IScheduledSendProvider = {
  async list(conversationId: ID): Promise<IScheduledSend[]> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("conversation_id", conversationId)
      .order("scheduled_for", { ascending: true });
    if (error)
      throw new Error(`[supabase] scheduledSend.list(${conversationId}) failed: ${error.message}`);
    return (data as unknown as ScheduledSendRow[]).map(rowToScheduledSend);
  },

  async listDue(now: ISO8601): Promise<IScheduledSend[]> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true });
    if (error) throw new Error(`[supabase] scheduledSend.listDue failed: ${error.message}`);
    return (data as unknown as ScheduledSendRow[]).map(rowToScheduledSend);
  },

  async create(
    input: Omit<IScheduledSend, "id" | "storeId" | "status" | "createdAt">,
  ): Promise<IScheduledSend> {
    const id: ID = crypto.randomUUID();
    // The multistore layer threads the active `storeId` onto the create input
    // before it reaches the provider (mirrors `withCreateStoreId` in the mock
    // impl); read it back here for the insert row.
    const storeId = (input as typeof input & { storeId?: ID }).storeId ?? null;
    const row = {
      id,
      store_id: storeId,
      conversation_id: input.conversationId,
      scheduled_for: input.scheduledFor,
      payload: input.payload,
      status: "pending" as ScheduledSendStatus,
      failure_reason: input.failureReason ?? null,
      created_by: input.createdBy,
    };
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(row)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] scheduledSend.create failed: ${error.message}`);
    return rowToScheduledSend(data as unknown as ScheduledSendRow);
  },

  async update(id: ID, patch: Partial<IScheduledSend>): Promise<IScheduledSend> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update(scheduledSendPatchToRow(patch))
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] scheduledSend.update(${id}) failed: ${error.message}`);
    return rowToScheduledSend(data as unknown as ScheduledSendRow);
  },

  async cancel(id: ID): Promise<IScheduledSend> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ status: "cancelled" as ScheduledSendStatus })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] scheduledSend.cancel(${id}) failed: ${error.message}`);
    return rowToScheduledSend(data as unknown as ScheduledSendRow);
  },

  async markSent(id: ID): Promise<IScheduledSend> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ status: "sent" as ScheduledSendStatus })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] scheduledSend.markSent(${id}) failed: ${error.message}`);
    return rowToScheduledSend(data as unknown as ScheduledSendRow);
  },

  async markFailed(id: ID, reason: string): Promise<IScheduledSend> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ status: "failed" as ScheduledSendStatus, failure_reason: reason })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] scheduledSend.markFailed(${id}) failed: ${error.message}`);
    return rowToScheduledSend(data as unknown as ScheduledSendRow);
  },
};
