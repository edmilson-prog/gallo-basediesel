import type {
  ID,
  ISdrContextSummary,
  ISdrEscalation,
  SdrEscalationMode,
  SdrEscalationReason,
  SdrEscalationStatus,
} from "@/shared/types";
import type {
  IListSdrEscalationsParams,
  ISdrEscalationsProvider,
} from "../../contracts/sdrEscalations";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link ISdrEscalationsProvider} (PRD-023).
 *
 * snake_case `sdr_escalations` table ↔ camelCase {@link ISdrEscalation} via
 * `rowToSdrEscalation`. One record per SDR → human handoff, kept forever for
 * audit and analytics. The contextual snapshot (`contextSummary`) is a nested
 * {@link ISdrContextSummary} object stored verbatim as jsonb, preserving the
 * evidence captured at handoff time. `sessionId` is a plain text column (the
 * SDR-session store has no Supabase table yet — see migration note); all other
 * relational ids carry foreign keys.
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (create/patch) require the write policies that land with PRD-103.
 */

interface SdrEscalationRow {
  id: string;
  session_id: string;
  conversation_id: string;
  customer_id: string | null;
  lead_id: string | null;
  store_id: string;
  reason: SdrEscalationReason;
  reason_details: string | null;
  mode: SdrEscalationMode;
  context_summary: ISdrContextSummary;
  assigned_seller_id: string | null;
  assigned_at: string | null;
  first_human_response_at: string | null;
  status: SdrEscalationStatus;
  specialty_matched: boolean | null;
  urgent_broadcast_at: string | null;
  urgent_broadcast_claimed_by_seller_id: string | null;
  urgent_broadcast_claimed_at: string | null;
  created_at: string;
}

const TABLE = "sdr_escalations";
const COLUMNS =
  "id, session_id, conversation_id, customer_id, lead_id, store_id, reason, reason_details, " +
  "mode, context_summary, assigned_seller_id, assigned_at, first_human_response_at, status, " +
  "specialty_matched, urgent_broadcast_at, urgent_broadcast_claimed_by_seller_id, " +
  "urgent_broadcast_claimed_at, created_at";

function rowToSdrEscalation(row: SdrEscalationRow): ISdrEscalation {
  return {
    id: row.id,
    sessionId: row.session_id,
    conversationId: row.conversation_id,
    customerId: row.customer_id ?? undefined,
    leadId: row.lead_id ?? undefined,
    storeId: row.store_id,
    reason: row.reason,
    reasonDetails: row.reason_details ?? undefined,
    mode: row.mode,
    contextSummary: row.context_summary,
    assignedSellerId: row.assigned_seller_id ?? undefined,
    assignedAt: row.assigned_at ?? undefined,
    firstHumanResponseAt: row.first_human_response_at ?? undefined,
    status: row.status,
    specialtyMatched: row.specialty_matched ?? undefined,
    urgentBroadcastAt: row.urgent_broadcast_at ?? undefined,
    urgentBroadcastClaimedBySellerId: row.urgent_broadcast_claimed_by_seller_id ?? undefined,
    urgentBroadcastClaimedAt: row.urgent_broadcast_claimed_at ?? undefined,
    createdAt: row.created_at,
  };
}

/** Maps a full escalation onto an insert/upsert row, including the immutable `id`. */
function escalationToRow(escalation: ISdrEscalation): Record<string, unknown> {
  return {
    id: escalation.id,
    session_id: escalation.sessionId,
    conversation_id: escalation.conversationId,
    customer_id: escalation.customerId ?? null,
    lead_id: escalation.leadId ?? null,
    store_id: escalation.storeId,
    reason: escalation.reason,
    reason_details: escalation.reasonDetails ?? null,
    mode: escalation.mode,
    context_summary: escalation.contextSummary,
    assigned_seller_id: escalation.assignedSellerId ?? null,
    assigned_at: escalation.assignedAt ?? null,
    first_human_response_at: escalation.firstHumanResponseAt ?? null,
    status: escalation.status,
    specialty_matched: escalation.specialtyMatched ?? null,
    urgent_broadcast_at: escalation.urgentBroadcastAt ?? null,
    urgent_broadcast_claimed_by_seller_id: escalation.urgentBroadcastClaimedBySellerId ?? null,
    urgent_broadcast_claimed_at: escalation.urgentBroadcastClaimedAt ?? null,
    created_at: escalation.createdAt,
  };
}

/** Maps a camelCase patch to snake_case columns. `id`/`storeId`/`createdAt` are
 *  immutable and never written. */
function escalationPatchToRow(patch: Partial<ISdrEscalation>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.sessionId !== undefined) row.session_id = patch.sessionId;
  if (patch.conversationId !== undefined) row.conversation_id = patch.conversationId;
  if (patch.customerId !== undefined) row.customer_id = patch.customerId;
  if (patch.leadId !== undefined) row.lead_id = patch.leadId;
  if (patch.reason !== undefined) row.reason = patch.reason;
  if (patch.reasonDetails !== undefined) row.reason_details = patch.reasonDetails;
  if (patch.mode !== undefined) row.mode = patch.mode;
  if (patch.contextSummary !== undefined) row.context_summary = patch.contextSummary;
  if (patch.assignedSellerId !== undefined) row.assigned_seller_id = patch.assignedSellerId;
  if (patch.assignedAt !== undefined) row.assigned_at = patch.assignedAt;
  if (patch.firstHumanResponseAt !== undefined)
    row.first_human_response_at = patch.firstHumanResponseAt;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.specialtyMatched !== undefined) row.specialty_matched = patch.specialtyMatched;
  if (patch.urgentBroadcastAt !== undefined) row.urgent_broadcast_at = patch.urgentBroadcastAt;
  if (patch.urgentBroadcastClaimedBySellerId !== undefined)
    row.urgent_broadcast_claimed_by_seller_id = patch.urgentBroadcastClaimedBySellerId;
  if (patch.urgentBroadcastClaimedAt !== undefined)
    row.urgent_broadcast_claimed_at = patch.urgentBroadcastClaimedAt;
  return row;
}

export const supabaseSdrEscalationsProvider: ISdrEscalationsProvider = {
  async list(params: IListSdrEscalationsParams = {}): Promise<ISdrEscalation[]> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS);

    if (params.storeId) query = query.eq("store_id", params.storeId);
    if (params.conversationId) query = query.eq("conversation_id", params.conversationId);
    if (params.sessionId) query = query.eq("session_id", params.sessionId);
    if (params.customerId) query = query.eq("customer_id", params.customerId);
    if (params.status) query = query.eq("status", params.status);
    if (params.mode) query = query.eq("mode", params.mode);
    if (params.reason) query = query.eq("reason", params.reason);
    if (params.assignedSellerId) query = query.eq("assigned_seller_id", params.assignedSellerId);
    if (params.fromDate) query = query.gte("created_at", params.fromDate);
    if (params.toDate) query = query.lte("created_at", params.toDate);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(`[supabase] sdrEscalations.list failed: ${error.message}`);
    return (data as unknown as SdrEscalationRow[]).map(rowToSdrEscalation);
  },

  async getById(id: ID): Promise<ISdrEscalation | null> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`[supabase] sdrEscalations.getById(${id}) failed: ${error.message}`);
    return data ? rowToSdrEscalation(data as unknown as SdrEscalationRow) : null;
  },

  async getByConversation(conversationId: ID): Promise<ISdrEscalation | null> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error)
      throw new Error(
        `[supabase] sdrEscalations.getByConversation(${conversationId}) failed: ${error.message}`,
      );
    return data ? rowToSdrEscalation(data as unknown as SdrEscalationRow) : null;
  },

  async create(escalation: ISdrEscalation): Promise<ISdrEscalation> {
    // The mock persists via `upsert`, so an existing id is replaced rather than
    // colliding. Mirror that insert-or-replace semantics here.
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .upsert(escalationToRow(escalation), { onConflict: "id" })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] sdrEscalations.create failed: ${error.message}`);
    return rowToSdrEscalation(data as unknown as SdrEscalationRow);
  },

  async patch(id: ID, patch: Partial<ISdrEscalation>): Promise<ISdrEscalation> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update(escalationPatchToRow(patch))
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] sdrEscalations.patch(${id}) failed: ${error.message}`);
    return rowToSdrEscalation(data as unknown as SdrEscalationRow);
  },
};
