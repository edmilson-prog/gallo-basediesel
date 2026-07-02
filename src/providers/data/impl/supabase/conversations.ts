import type {
  ID,
  IConversation,
  IConversationContact,
  IDistributionTrace,
  IMessage,
  LeadTemperature,
} from "@/shared/types";
import type {
  IConversationsProvider,
  ICreateConversationInput,
  ICreateConversationResult,
  ICreateOutboundConversationInput,
  IListConversationsParams,
} from "../../contracts/conversations";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { distributeConversation, type IDistributionInput } from "@/features/distribution/engine";
import { applyRotationOverride } from "@/features/rotation/engine/applyRotationOverride";
import { supabaseSettingsProvider } from "./settings";
import { supabaseSellersProvider } from "./sellers";
import { supabaseCustomersProvider } from "./customers";
import { supabaseLeadsProvider } from "./leads";
import { supabaseDistributionTracesProvider } from "./distributionTraces";
import { supabaseRotationQueuesProvider } from "./rotationQueues";
import { supabaseRotationParticipantsProvider } from "./rotationParticipants";
import { buildAssignmentOrFilter, sanitizeSellerIds } from "./assignmentFilter";

/**
 * Supabase implementation of {@link IConversationsProvider} (PRD-100+).
 *
 * snake_case `conversations` table ↔ camelCase {@link IConversation} via
 * `rowToConversation`. The table-backed CRUD (list/get/update/markRead/
 * assignSeller/archive) works today under the temporary permissive RLS; the
 * mutations require the write policies that land with PRD-103.
 *
 * `create` runs the pure distribution engine (PRD-013) against the sibling
 * Supabase providers (settings / sellers / customers / leads), then persists the
 * conversation, the inbound (+ optional system) `messages`, and a
 * `distribution_traces` row, and advances the round-robin cursor on the store
 * settings. The four writes are NOT wrapped in a transaction (PostgREST has no
 * client-side multi-statement tx) — atomicity is deferred to the Fase 2 inbound
 * Edge Function; for the current single-store MVP the ordered best-effort writes
 * mirror the mock's own non-atomic flow.
 *
 * Filter caveats vs. the mock provider:
 *  - `search` (customer/lead name + phone ONLY) is applied server-side via the
 *    `search_conversations` RPC (SECURITY DEFINER, `can_access_conversation`
 *    gated). When `search` is present, `list` routes through that RPC; ABC
 *    ordering degrades to `lastMessageAt` there. Message CONTENT search is a
 *    separate action — see `searchMessages` / `search_conversation_messages`.
 *  - `tags` matches the conversation's OWN tags only; the mock additionally
 *    folds in customer/lead tags via joins, which is not expressible in a single
 *    PostgREST query.
 *  - `orderBy: "abcClass"` needs the customer ABC classification join, so it
 *    falls back to `lastMessageAt` ordering here.
 */

interface ConversationRow {
  id: string;
  store_id: string;
  customer_id: string | null;
  lead_id: string | null;
  assigned_seller_id: string | null;
  channel: IConversation["channel"];
  whatsapp_account_id: string | null;
  status: IConversation["status"];
  is_sdr_active: boolean;
  tags: string[];
  linked_order_id: string | null;
  last_message_at: string;
  unread_count: number;
  created_at: string;
}

/** Valid lead temperatures — the RPC returns a raw text column (no DB enum/check),
 *  so coerce any unexpected value to null instead of trusting it into the UI. */
const LEAD_TEMPERATURES = new Set<LeadTemperature>(["frio", "morno", "quente"]);

/** Shape returned by the `conversation_contacts` RPC (see migration). */
interface ConversationContactRow {
  conversation_id: string;
  ref_id: string | null;
  is_lead: boolean;
  name: string | null;
  phone: string | null;
  avatar_url: string | null;
  temperature: string | null;
}

const TABLE = "conversations";
const COLUMNS =
  "id, store_id, customer_id, lead_id, assigned_seller_id, channel, whatsapp_account_id, status, is_sdr_active, tags, linked_order_id, last_message_at, unread_count, created_at";

function rowToConversation(row: ConversationRow): IConversation {
  return {
    id: row.id,
    storeId: row.store_id,
    customerId: row.customer_id ?? undefined,
    leadId: row.lead_id ?? undefined,
    assignedSellerId: row.assigned_seller_id ?? undefined,
    channel: row.channel,
    whatsappAccountId: row.whatsapp_account_id ?? undefined,
    status: row.status,
    isSdrActive: row.is_sdr_active,
    tags: row.tags,
    linkedOrderId: row.linked_order_id ?? undefined,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
    createdAt: row.created_at,
  };
}

/** Maps a camelCase patch to snake_case columns. `id`/`storeId`/`createdAt` are
 *  immutable and never written. */
function conversationPatchToRow(patch: Partial<IConversation>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.customerId !== undefined) row.customer_id = patch.customerId;
  if (patch.leadId !== undefined) row.lead_id = patch.leadId;
  if (patch.assignedSellerId !== undefined) row.assigned_seller_id = patch.assignedSellerId;
  if (patch.channel !== undefined) row.channel = patch.channel;
  if (patch.whatsappAccountId !== undefined) row.whatsapp_account_id = patch.whatsappAccountId;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.isSdrActive !== undefined) row.is_sdr_active = patch.isSdrActive;
  if (patch.tags !== undefined) row.tags = patch.tags;
  if (patch.linkedOrderId !== undefined) row.linked_order_id = patch.linkedOrderId;
  if (patch.lastMessageAt !== undefined) row.last_message_at = patch.lastMessageAt;
  if (patch.unreadCount !== undefined) row.unread_count = patch.unreadCount;
  return row;
}

/** Shared page/pageSize clamping for the RPC-backed search paths (and the plain table query). */
function resolvePagination(params: IListConversationsParams): { page: number; pageSize: number } {
  return {
    page: Math.max(1, Math.floor(params.page ?? 1)),
    pageSize: Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20))),
  };
}

/**
 * Shared RPC parameter shape for `search_conversations` and
 * `search_conversation_messages` — both take the exact same filter set (only
 * the function name and row mapper differ), so building it once keeps the two
 * search paths from silently diverging when a filter is added later.
 */
function buildSearchRpcParams(params: IListConversationsParams, page: number, pageSize: number) {
  const status =
    params.status === undefined ? null : Array.isArray(params.status) ? params.status : [params.status];
  // Drop crafted non-UUID tokens before the `uuid[]` RPC arg (parity with the
  // table path's buildAssignmentOrFilter guard).
  const searchSellerIds = sanitizeSellerIds(params.assignmentAny?.sellerIds);

  return {
    // `p_search` has no SQL default (unlike the other params) — PostgREST can't
    // resolve the function overload if this key is omitted from the JSON body,
    // which happens whenever `params.search` is `undefined` (JSON.stringify drops
    // undefined keys). Always send a string; each RPC's own length(trim(...))>0
    // guard already treats an empty term as "no match" (0 rows).
    p_search: params.search ?? "",
    p_store_id: params.storeId ?? null,
    p_status: status,
    p_channel: params.channel ?? null,
    p_whatsapp_account_id: params.whatsappAccountId ?? null,
    p_assigned_seller_id: params.assignedSellerId ?? null,
    p_unassigned: params.unassigned ?? params.assignmentAny?.unassigned ?? false,
    p_assigned_seller_ids: searchSellerIds.length > 0 ? searchSellerIds : null,
    p_include_queue: params.assignmentAny?.queue ?? false,
    p_is_sdr_active: typeof params.isSdrActive === "boolean" ? params.isSdrActive : null,
    p_tags: params.tags && params.tags.length > 0 ? params.tags : null,
    p_from_date: params.fromDate ?? null,
    p_to_date: params.toDate ?? null,
    p_order_dir: params.orderDir === "asc" ? "asc" : "desc",
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  };
}

/**
 * Cross-entity text search via the `search_conversations` RPC. Honors the same
 * filters as the table query (status/channel/instance/assignment/SDR/tags/period)
 * plus ordering + pagination, and reads the window `total_count` off the rows.
 */
async function searchConversations(
  params: IListConversationsParams,
): Promise<IPaginatedResult<IConversation>> {
  const { page, pageSize } = resolvePagination(params);

  const { data, error } = await getSupabaseClient().rpc(
    "search_conversations",
    buildSearchRpcParams(params, page, pageSize),
  );

  if (error) throw new Error(`[supabase] conversations.search failed: ${error.message}`);

  const rows = (data ?? []) as unknown as (ConversationRow & { total_count: number })[];
  return {
    data: rows.map(rowToConversation),
    total: Number(rows[0]?.total_count ?? 0),
    page,
    pageSize,
  };
}

/** Row shape returned by `search_conversation_messages` — base conversation columns
 *  plus the representative matched message. */
type ConversationMessageMatchRow = ConversationRow & {
  matched_message_text: string;
  matched_message_sent_at: string;
  matched_message_direction: string;
  matched_message_extra_count: number;
  total_count: number;
};

/** `messages.direction` is a raw `text` column with no CHECK constraint — coerce
 *  any unexpected value instead of trusting it, mirroring the `LEAD_TEMPERATURES`
 *  guard above. Falls back to "in" (a stray value never mislabels a customer
 *  message as ours). */
function normalizeMessageDirection(value: string): "in" | "out" {
  return value === "out" ? "out" : "in";
}

function rowToConversationWithMatch(row: ConversationMessageMatchRow): IConversation {
  return {
    ...rowToConversation(row),
    matchedMessage: {
      text: row.matched_message_text,
      sentAt: row.matched_message_sent_at,
      direction: normalizeMessageDirection(row.matched_message_direction),
      extraMatchCount: row.matched_message_extra_count,
    },
  };
}

/**
 * Dedicated search across MESSAGE TEXT via the `search_conversation_messages`
 * RPC — same filters/pagination as `searchConversations`, but the match scope
 * is message content only, and each row carries the representative matching
 * message (see `rowToConversationWithMatch`).
 */
async function searchConversationMessages(
  params: IListConversationsParams,
): Promise<IPaginatedResult<IConversation>> {
  const { page, pageSize } = resolvePagination(params);

  const { data, error } = await getSupabaseClient().rpc(
    "search_conversation_messages",
    buildSearchRpcParams(params, page, pageSize),
  );

  if (error)
    throw new Error(`[supabase] conversations.searchMessages failed: ${error.message}`);

  const rows = (data ?? []) as unknown as ConversationMessageMatchRow[];
  return {
    data: rows.map(rowToConversationWithMatch),
    total: Number(rows[0]?.total_count ?? 0),
    page,
    pageSize,
  };
}

export const supabaseConversationsProvider: IConversationsProvider = {
  async searchMessages(params: IListConversationsParams = {}): Promise<IPaginatedResult<IConversation>> {
    return searchConversationMessages(params);
  },

  async list(params: IListConversationsParams = {}): Promise<IPaginatedResult<IConversation>> {
    // Cross-entity text search needs joins → dedicated RPC. Everything else
    // stays on the plain table query below.
    if (params.search && params.search.trim().length > 0) {
      return searchConversations(params);
    }

    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
    if (params.assignedSellerId !== undefined)
      query = query.eq("assigned_seller_id", params.assignedSellerId);
    if (params.unassigned) query = query.is("assigned_seller_id", null);
    const assignmentOr = buildAssignmentOrFilter(params.assignmentAny);
    if (assignmentOr) query = query.or(assignmentOr);

    if (params.status !== undefined) {
      if (Array.isArray(params.status)) {
        query = query.in("status", params.status);
      } else {
        query = query.eq("status", params.status);
      }
    }

    if (params.channel !== undefined) query = query.eq("channel", params.channel);
    if (params.whatsappAccountId !== undefined)
      query = query.eq("whatsapp_account_id", params.whatsappAccountId);
    if (typeof params.isSdrActive === "boolean")
      query = query.eq("is_sdr_active", params.isSdrActive);
    if (params.customerId !== undefined) query = query.eq("customer_id", params.customerId);
    if (params.leadId !== undefined) query = query.eq("lead_id", params.leadId);
    if (params.fromDate !== undefined) query = query.gte("last_message_at", params.fromDate);
    if (params.toDate !== undefined) query = query.lte("last_message_at", params.toDate);
    // `tags` matches the conversation's own tags only (mock also folds in
    // customer/lead tags via joins, which a single PostgREST query cannot do).
    if (params.tags && params.tags.length > 0) query = query.overlaps("tags", params.tags);
    // `search` never reaches here — it is routed to `searchConversations` above.

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // `abcClass` ordering needs the customer ABC join; fall back to lastMessageAt.
    const ascending = params.orderDir === "asc";
    const { data, error, count } = await query
      .order("last_message_at", { ascending })
      .range(from, to);

    if (error) throw new Error(`[supabase] conversations.list failed: ${error.message}`);

    return {
      data: (data as unknown as ConversationRow[]).map(rowToConversation),
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async listContacts(conversationIds: ID[]): Promise<IConversationContact[]> {
    if (conversationIds.length === 0) return [];
    // SECURITY DEFINER RPC gated by can_access_conversation: returns the contact
    // for any of these conversations the caller can access (POOL included),
    // bypassing the customers RLS that would hide an unassigned conversation's
    // customer. The access check runs only over this bounded id list — never a
    // full-table customers scan (that is what tripped statement_timeout in #120).
    const { data, error } = await getSupabaseClient().rpc("conversation_contacts", {
      p_ids: conversationIds,
    });
    if (error)
      throw new Error(`[supabase] conversations.listContacts failed: ${error.message}`);
    const rows = (data ?? []) as unknown as ConversationContactRow[];
    return rows.map((r) => ({
      conversationId: r.conversation_id,
      refId: r.ref_id ?? r.conversation_id,
      isLead: r.is_lead,
      name: r.name ?? "",
      phone: r.phone ?? "",
      avatarUrl: r.avatar_url ?? undefined,
      temperature: LEAD_TEMPERATURES.has(r.temperature as LeadTemperature)
        ? (r.temperature as LeadTemperature)
        : null,
    }));
  },

  async get(id: ID): Promise<IConversation> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`[supabase] conversations.get(${id}) failed: ${error.message}`);
    return rowToConversation(data as ConversationRow);
  },

  async update(id: ID, patch: Partial<IConversation>): Promise<IConversation> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ ...conversationPatchToRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] conversations.update(${id}) failed: ${error.message}`);
    return rowToConversation(data as ConversationRow);
  },

  async markRead(id: ID): Promise<IConversation> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ unread_count: 0, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] conversations.markRead(${id}) failed: ${error.message}`);
    return rowToConversation(data as ConversationRow);
  },

  async assignSeller(id: ID, sellerId: ID): Promise<IConversation> {
    // Routed through the SECURITY DEFINER `transfer_conversation` RPC: a non-staff
    // seller reassigning a conversation to ANOTHER seller would otherwise be
    // rejected by RLS (the new row leaves their read scope). The RPC authorizes
    // the caller (staff, or the conversation is theirs/unassigned), reassigns with
    // elevated privileges, and returns the updated row — covering self-assign,
    // manager transfer and seller transfer alike.
    const { data, error } = await getSupabaseClient()
      .rpc("transfer_conversation", {
        p_conversation_id: id,
        p_to_seller_id: sellerId,
      })
      .single();
    if (error)
      throw new Error(`[supabase] conversations.assignSeller(${id}) failed: ${error.message}`);
    return rowToConversation(data as ConversationRow);
  },

  async unassign(id: ID): Promise<IConversation> {
    // Direct table UPDATE to null the assignee — returns the conversation to the
    // pool/queue. Unlike assignSeller (which must hand a row OUT of a seller's
    // read scope, hence the SECURITY DEFINER RPC), nulling the column is
    // authorized directly by the conversations_update policy whenever is_staff()
    // (USING + WITH CHECK). A non-staff caller is rejected by RLS; the UI gates
    // the action to staff, so this never runs for them.
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ assigned_seller_id: null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] conversations.unassign(${id}) failed: ${error.message}`);
    return rowToConversation(data as ConversationRow);
  },

  async archive(id: ID): Promise<void> {
    const { error } = await getSupabaseClient()
      .from(TABLE)
      .update({ status: "arquivada", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(`[supabase] conversations.archive(${id}) failed: ${error.message}`);
  },

  async createOutbound(input: ICreateOutboundConversationInput): Promise<IConversation> {
    const now = new Date().toISOString();
    // Direct insert (no distribution): the conversations_insert RLS WITH CHECK
    // allows a non-staff seller to create a row in their store assigned to
    // themselves — exactly this outbound case. The first message is sent later
    // from the composer (provider-aware).
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert({
        store_id: input.storeId,
        customer_id: input.customerId,
        assigned_seller_id: input.assignedSellerId,
        channel: "whatsapp",
        whatsapp_account_id: input.whatsappAccountId,
        status: "em_andamento",
        is_sdr_active: false,
        tags: [],
        last_message_at: now,
        unread_count: 0,
      })
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] conversations.createOutbound failed: ${error.message}`);
    return rowToConversation(data as unknown as ConversationRow);
  },

  async create(input: ICreateConversationInput): Promise<ICreateConversationResult> {
    const client = getSupabaseClient();
    const occurredAt = input.occurredAt ?? new Date().toISOString();

    // --- Build the read-only world the (pure) engine inspects ------------------
    const platform = await supabaseSettingsProvider.get(input.storeId);
    const settings = platform.distribution;
    const sellers = await supabaseSellersProvider.list({ storeId: input.storeId });

    // Open-conversation load per seller (the `carga` criterion reads this).
    const { data: openRows, error: loadError } = await client
      .from(TABLE)
      .select("assigned_seller_id")
      .eq("store_id", input.storeId)
      .in("status", ["aguardando", "em_andamento", "aguardando_cliente"])
      .not("assigned_seller_id", "is", null);
    if (loadError)
      throw new Error(`[supabase] conversations.create (load) failed: ${loadError.message}`);
    const loadBySeller: Record<ID, number> = {};
    for (const row of openRows as { assigned_seller_id: string | null }[]) {
      if (!row.assigned_seller_id) continue;
      loadBySeller[row.assigned_seller_id] = (loadBySeller[row.assigned_seller_id] ?? 0) + 1;
    }

    let participant: IDistributionInput["participant"];
    if (input.customerId) {
      participant = {
        kind: "customer",
        customer: await supabaseCustomersProvider.get(input.customerId),
      };
    } else if (input.leadId) {
      participant = { kind: "lead", lead: await supabaseLeadsProvider.get(input.leadId) };
    } else {
      throw new Error("[supabase] conversations.create requires a customerId or a leadId.");
    }

    // --- Decide (pure) ---------------------------------------------------------
    const conversationId = crypto.randomUUID();
    const decision = distributeConversation(
      {
        conversationId,
        storeId: input.storeId,
        channel: input.channel,
        participant,
        firstMessageText: input.firstMessageText,
        occurredAt,
      },
      { settings, sellers, loadBySeller },
    );

    // PRD-213: the rotation queue is the source of the routine revezamento
    // (boundary contract w/ PRD-013). Carteira/especialidade keep upstream
    // precedence; an empty queue keeps the 013 fallback. One assignment per
    // conversation. The real webhook path is intentionally untouched.
    const rotationState = await supabaseRotationQueuesProvider.getState(input.storeId);
    const sellersById = Object.fromEntries(sellers.map((s) => [s.id, s]));
    const override = applyRotationOverride(
      decision,
      rotationState,
      sellersById,
      new Date(occurredAt),
    );
    const effective = override.decision;
    const rotationPointers = override.pointers;

    // --- Persist (ordered, best-effort — see file header on atomicity) ---------
    const { data: convData, error: convError } = await client
      .from(TABLE)
      .insert({
        id: conversationId,
        store_id: input.storeId,
        customer_id: input.customerId ?? null,
        lead_id: input.leadId ?? null,
        assigned_seller_id: effective.selectedSellerId,
        channel: input.channel,
        whatsapp_account_id: input.whatsappAccountId ?? null,
        status: effective.status,
        is_sdr_active: effective.isSdrActive,
        tags: [],
        linked_order_id: null,
        last_message_at: occurredAt,
        unread_count: 1,
        created_at: occurredAt,
      })
      .select(COLUMNS)
      .single();
    if (convError) throw new Error(`[supabase] conversations.create failed: ${convError.message}`);
    const conversation = rowToConversation(convData as ConversationRow);

    const provider = input.channel === "whatsapp" ? "meta" : "mock";
    const messages: IMessage[] = [];
    const messageRows: Record<string, unknown>[] = [];

    const incoming: IMessage = {
      id: crypto.randomUUID(),
      conversationId,
      direction: "in",
      authorType: "customer",
      authorId: input.customerId ?? input.leadId,
      provider,
      text: input.firstMessageText,
      status: "delivered",
      sentAt: occurredAt,
      deliveredAt: occurredAt,
    };
    messages.push(incoming);
    messageRows.push({
      id: incoming.id,
      conversation_id: conversationId,
      direction: "in",
      author_type: "customer",
      author_id: incoming.authorId ?? null,
      provider,
      text: incoming.text,
      status: "delivered",
      sent_at: occurredAt,
      delivered_at: occurredAt,
    });

    if (effective.systemMessage) {
      const systemSentAt = new Date(new Date(occurredAt).getTime() + 1000).toISOString();
      const system: IMessage = {
        id: crypto.randomUUID(),
        conversationId,
        direction: "out",
        authorType: "system",
        authorId: "sdr-agent",
        provider,
        text: effective.systemMessage,
        status: "sent",
        sentAt: systemSentAt,
      };
      messages.push(system);
      messageRows.push({
        id: system.id,
        conversation_id: conversationId,
        direction: "out",
        author_type: "system",
        author_id: "sdr-agent",
        provider,
        text: system.text,
        status: "sent",
        sent_at: systemSentAt,
      });
    }

    const { error: msgError } = await client.from("messages").insert(messageRows);
    if (msgError)
      throw new Error(`[supabase] conversations.create (messages) failed: ${msgError.message}`);

    const trace: IDistributionTrace = {
      id: crypto.randomUUID(),
      conversationId,
      customerId: input.customerId,
      leadId: input.leadId,
      storeId: input.storeId,
      timestamp: occurredAt,
      selectedSellerId: effective.selectedSellerId,
      criterionMatched: effective.criterionMatched,
      candidatesEvaluated: effective.candidatesEvaluated,
      mode: effective.mode,
    };
    await supabaseDistributionTracesProvider.create(trace);

    // Advance the rotation pointers when the queue took over; otherwise keep the
    // legacy round-robin cursor advance for non-governed cases (mirrors the mock).
    if (rotationPointers) {
      await supabaseRotationQueuesProvider.update(input.storeId, {
        lastAssignedRefId: rotationPointers.topRefId,
      });
      for (const [deptId, memberId] of Object.entries(rotationPointers.memberByDept)) {
        await supabaseRotationParticipantsProvider.setMemberPointer(
          rotationState.queue.id,
          deptId,
          memberId,
        );
      }
    } else if (effective.criterionMatched === "round_robin" && effective.selectedSellerId) {
      await supabaseSettingsProvider.update(input.storeId, {
        distribution: { ...settings, lastAssignedSellerId: effective.selectedSellerId },
      });
    }

    return { conversation, messages, trace };
  },
};
