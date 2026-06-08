import type {
  ID,
  ISdrCollectedData,
  ISdrSession,
  SdrFinishReason,
  SdrSessionState,
} from "@/shared/types";
import type { IListSdrSessionsParams, ISdrSessionsProvider } from "../../contracts/sdrSessions";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link ISdrSessionsProvider} (PRD-020 / PRD-024).
 *
 * snake_case `sdr_sessions` table ↔ camelCase {@link ISdrSession} via
 * `rowToSdrSession`. A session is bound 1:1 to a conversation
 * (`conversation_id` FK); the agent's accumulated `collectedData` — names,
 * pending identifications, pending quotes, captured order stubs — is a nested
 * object stored as a single jsonb column and rehydrated verbatim.
 *
 * `ISdrSession` carries no `storeId`, so the contract's `storeId` list filter
 * has no column to bind to and is intentionally a no-op here, mirroring the
 * mock (which also ignores it).
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (upsert/patch/pause/resume) require the write policies that land with
 * PRD-103.
 */

interface SdrSessionRow {
  id: string;
  conversation_id: string;
  state: SdrSessionState;
  collected_data: ISdrCollectedData;
  last_activity_at: string;
  started_at: string;
  finished_at: string | null;
  finish_reason: SdrFinishReason | null;
  paused_from_state: SdrSessionState | null;
}

const TABLE = "sdr_sessions";
const COLUMNS =
  "id, conversation_id, state, collected_data, last_activity_at, started_at, finished_at, " +
  "finish_reason, paused_from_state";

function rowToSdrSession(row: SdrSessionRow): ISdrSession {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    state: row.state,
    collectedData: row.collected_data,
    lastActivityAt: row.last_activity_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    finishReason: row.finish_reason ?? undefined,
    pausedFromState: row.paused_from_state ?? undefined,
  };
}

/** Maps a full {@link ISdrSession} onto an insert/upsert row. */
function sessionToRow(session: ISdrSession): Record<string, unknown> {
  return {
    id: session.id,
    conversation_id: session.conversationId,
    state: session.state,
    collected_data: session.collectedData,
    last_activity_at: session.lastActivityAt,
    started_at: session.startedAt,
    finished_at: session.finishedAt ?? null,
    finish_reason: session.finishReason ?? null,
    paused_from_state: session.pausedFromState ?? null,
  };
}

/** Maps a camelCase patch to snake_case columns. `id`/`conversationId`/
 *  `startedAt` are immutable and never written. */
function sessionPatchToRow(patch: Partial<ISdrSession>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.state !== undefined) row.state = patch.state;
  if (patch.collectedData !== undefined) row.collected_data = patch.collectedData;
  if (patch.lastActivityAt !== undefined) row.last_activity_at = patch.lastActivityAt;
  if (patch.finishedAt !== undefined) row.finished_at = patch.finishedAt;
  if (patch.finishReason !== undefined) row.finish_reason = patch.finishReason;
  if (patch.pausedFromState !== undefined) row.paused_from_state = patch.pausedFromState;
  return row;
}

export const supabaseSdrSessionsProvider: ISdrSessionsProvider = {
  async list(params: IListSdrSessionsParams = {}): Promise<ISdrSession[]> {
    // `storeId` has no column on `sdr_sessions` (sessions carry no store), so it
    // is intentionally ignored here — exactly as the mock does.
    let query = getSupabaseClient().from(TABLE).select(COLUMNS);

    if (params.conversationId !== undefined) {
      query = query.eq("conversation_id", params.conversationId);
    }
    if (params.state !== undefined) query = query.eq("state", params.state);
    if (params.finishReason !== undefined) {
      query = query.eq("finish_reason", params.finishReason);
    }
    if (params.fromDate !== undefined) query = query.gte("started_at", params.fromDate);
    if (params.toDate !== undefined) query = query.lte("started_at", params.toDate);

    const { data, error } = await query.order("started_at", { ascending: false });
    if (error) throw new Error(`[supabase] sdrSessions.list failed: ${error.message}`);
    return (data as unknown as SdrSessionRow[]).map(rowToSdrSession);
  },

  async listActive(): Promise<ISdrSession[]> {
    // Active = not yet terminated and not parked by a human.
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .not("state", "in", "(finalizado,pausado)")
      .order("started_at", { ascending: false });
    if (error) throw new Error(`[supabase] sdrSessions.listActive failed: ${error.message}`);
    return (data as unknown as SdrSessionRow[]).map(rowToSdrSession);
  },

  async getByConversation(conversationId: ID): Promise<ISdrSession | null> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (error)
      throw new Error(
        `[supabase] sdrSessions.getByConversation(${conversationId}) failed: ${error.message}`,
      );
    return data ? rowToSdrSession(data as unknown as SdrSessionRow) : null;
  },

  async upsert(session: ISdrSession): Promise<ISdrSession> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .upsert(sessionToRow(session), { onConflict: "id" })
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] sdrSessions.upsert(${session.id}) failed: ${error.message}`);
    return rowToSdrSession(data as unknown as SdrSessionRow);
  },

  async patch(id: ID, patch: Partial<ISdrSession>): Promise<ISdrSession> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update(sessionPatchToRow(patch))
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] sdrSessions.patch(${id}) failed: ${error.message}`);
    return rowToSdrSession(data as unknown as SdrSessionRow);
  },

  async pause(id: ID, now: string = new Date().toISOString()): Promise<ISdrSession> {
    // Snapshot the current state so `resume` can restore it cleanly. Read the row
    // first to capture `state` (the mock does the same before patching).
    const client = getSupabaseClient();
    const { data: current, error: readError } = await client
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (readError)
      throw new Error(`[supabase] sdrSessions.pause(${id}) failed: ${readError.message}`);

    const currentState = (current as unknown as SdrSessionRow).state;
    const { data, error } = await client
      .from(TABLE)
      .update({
        state: "pausado" as SdrSessionState,
        paused_from_state: currentState,
        finish_reason: "paused_by_human" as SdrFinishReason,
        last_activity_at: now,
      })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] sdrSessions.pause(${id}) failed: ${error.message}`);
    return rowToSdrSession(data as unknown as SdrSessionRow);
  },

  async resume(id: ID, now: string = new Date().toISOString()): Promise<ISdrSession> {
    // Restore the snapshotted state (falling back to `qualificacao`) and clear
    // the pause/finish bookkeeping, matching the mock exactly.
    const client = getSupabaseClient();
    const { data: current, error: readError } = await client
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (readError)
      throw new Error(`[supabase] sdrSessions.resume(${id}) failed: ${readError.message}`);

    const restored: SdrSessionState =
      (current as unknown as SdrSessionRow).paused_from_state ?? "qualificacao";
    const { data, error } = await client
      .from(TABLE)
      .update({
        state: restored,
        paused_from_state: null,
        finish_reason: null,
        finished_at: null,
        last_activity_at: now,
      })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] sdrSessions.resume(${id}) failed: ${error.message}`);
    return rowToSdrSession(data as unknown as SdrSessionRow);
  },
};
