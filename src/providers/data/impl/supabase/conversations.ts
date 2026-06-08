import type { ID, IConversation } from "@/shared/types";
import type {
  IConversationsProvider,
  ICreateConversationInput,
  ICreateConversationResult,
  IListConversationsParams,
} from "../../contracts/conversations";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { NotImplementedError } from "../../errors";

/**
 * Supabase implementation of {@link IConversationsProvider} (PRD-100+).
 *
 * snake_case `conversations` table ↔ camelCase {@link IConversation} via
 * `rowToConversation`. The table-backed CRUD (list/get/update/markRead/
 * assignSeller/archive) works today under the temporary permissive RLS; the
 * mutations require the write policies that land with PRD-103.
 *
 * `create` runs the distribution engine (PRD-013), persists a
 * `distribution_traces` row, emits system/inbound `messages`, and advances the
 * round-robin cursor on the store settings — an orchestration that belongs to a
 * Fase 2 Edge Function. It stays a {@link NotImplementedError} stub until that
 * server-side wiring (and the dependent settings / distributionTraces / leads /
 * customers Supabase providers) lands.
 *
 * Filter caveats vs. the mock provider:
 *  - `search` (cross-entity full text over customer/lead name + phone + recent
 *    message bodies) requires joins and is NOT applied server-side here.
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

export const supabaseConversationsProvider: IConversationsProvider = {
  async list(params: IListConversationsParams = {}): Promise<IPaginatedResult<IConversation>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
    if (params.assignedSellerId !== undefined)
      query = query.eq("assigned_seller_id", params.assignedSellerId);
    if (params.unassigned) query = query.is("assigned_seller_id", null);

    if (params.status !== undefined) {
      if (Array.isArray(params.status)) {
        query = query.in("status", params.status);
      } else {
        query = query.eq("status", params.status);
      }
    }

    if (params.channel !== undefined) query = query.eq("channel", params.channel);
    if (typeof params.isSdrActive === "boolean")
      query = query.eq("is_sdr_active", params.isSdrActive);
    if (params.customerId !== undefined) query = query.eq("customer_id", params.customerId);
    if (params.leadId !== undefined) query = query.eq("lead_id", params.leadId);
    if (params.fromDate !== undefined) query = query.gte("last_message_at", params.fromDate);
    if (params.toDate !== undefined) query = query.lte("last_message_at", params.toDate);
    // `tags` matches the conversation's own tags only (mock also folds in
    // customer/lead tags via joins, which a single PostgREST query cannot do).
    if (params.tags && params.tags.length > 0) query = query.overlaps("tags", params.tags);
    // NOTE: `search` (cross-entity full text) is intentionally not applied here.

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(200, Math.floor(params.pageSize ?? 20)));
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
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({
        assigned_seller_id: sellerId,
        is_sdr_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] conversations.assignSeller(${id}) failed: ${error.message}`);
    return rowToConversation(data as ConversationRow);
  },

  async archive(id: ID): Promise<void> {
    const { error } = await getSupabaseClient()
      .from(TABLE)
      .update({ status: "arquivada", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(`[supabase] conversations.archive(${id}) failed: ${error.message}`);
  },

  create(_input: ICreateConversationInput): Promise<ICreateConversationResult> {
    // The inbound-creation flow runs the pure distribution engine (PRD-013),
    // persists a distribution trace, emits inbound/system messages, and advances
    // the store round-robin cursor — orchestration reserved for a Fase 2 Edge
    // Function (depends on the settings / distributionTraces / messages / leads /
    // customers Supabase providers, several of which are still stubs).
    throw new NotImplementedError(
      "SupabaseConversationsProvider.create — implementar na Fase 2 (engine de distribuição como Edge Function).",
    );
  },
};
