import type { ID, IMessage, MessageMediaType } from "@/shared/types";
import type {
  IListMessagesForAnalyticsParams,
  IListMessagesParams,
  IMessagesProvider,
} from "../../contracts/messages";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import {
  classifyMediaRef,
  MEDIA_BUCKET,
  partitionMediaRefs,
  whatsappMediaObjectPath,
} from "@/shared/utils/mediaRef";

/** Signed-URL lifetime for in-app playback/preview — comfortably long so a
 *  conversation left open doesn't expire mid-listen (Storage RLS still gates). */
const MEDIA_SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Supabase implementation of {@link IMessagesProvider} (PRD-100+).
 *
 * snake_case `messages` table ↔ camelCase {@link IMessage} via `rowToMessage`.
 * {@link IMessage} is immutable in the domain model, so the table carries a
 * `created_at` but **no** `updated_at` — there is no update-timestamp trigger,
 * and `markStatus` only mutates the delivery `status` column.
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (send/markStatus) require the write policies that land with PRD-103.
 * `simulateIncoming` is a mock-only affordance for the real-time demo; the
 * Supabase backend leaves it un-persisted until real WhatsApp inbound is wired
 * in Fase 2.
 */

interface MessageRow {
  id: string;
  conversation_id: string;
  direction: IMessage["direction"];
  author_type: IMessage["authorType"];
  author_id: string | null;
  provider: IMessage["provider"];
  text: string;
  media_type: MessageMediaType | null;
  media_url: string | null;
  status: IMessage["status"];
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  failure_reason: string | null;
  failure_code: string | null;
  created_at: string;
}

const TABLE = "messages";
const COLUMNS =
  "id, conversation_id, direction, author_type, author_id, provider, text, media_type, " +
  "media_url, status, sent_at, delivered_at, read_at, failure_reason, failure_code, created_at";

function rowToMessage(row: MessageRow): IMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    direction: row.direction,
    authorType: row.author_type,
    authorId: row.author_id ?? undefined,
    provider: row.provider,
    text: row.text,
    mediaType: row.media_type ?? undefined,
    mediaUrl: row.media_url ?? undefined,
    status: row.status,
    sentAt: row.sent_at,
    // `created_at` (DEFAULT now()) is when our server persisted the row — i.e.
    // when we received/processed it. For inbound it can lag `sent_at` (the
    // original WhatsApp timestamp); surfaced as the second time in the bubble.
    receivedAt: row.created_at,
    deliveredAt: row.delivered_at ?? undefined,
    readAt: row.read_at ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    failureCode: row.failure_code ?? undefined,
  };
}

type MessageSendInput = Omit<
  IMessage,
  "id" | "conversationId" | "sentAt" | "status" | "direction" | "provider"
>;

export const supabaseMessagesProvider: IMessagesProvider = {
  async list(params: IListMessagesParams): Promise<IPaginatedResult<IMessage>> {
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));

    // Read the page via the SECURITY DEFINER `conversation_messages` RPC, which
    // checks `can_access_conversation` ONCE (constant arg) instead of the
    // `messages_select` RLS evaluating it PER ROW. The per-row evaluation cost
    // ~3ms × up to 200 rows ≈ 640ms for a large conversation (EXPLAIN: SubPlan
    // loops=200), and under rapid conversation switching it piled up past the 8s
    // statement_timeout → 500 on /messages. Gating once + the
    // (conversation_id, sent_at) index brings a page to ~8ms. Same rows, order
    // and pagination as the old table query; no caller depends on an exact
    // `total` (pagination drives off full-vs-short page — see useMessages).
    const { data, error } = await getSupabaseClient().rpc("conversation_messages", {
      p_conversation_id: params.conversationId,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
      p_order_dir: params.orderDir === "desc" ? "desc" : "asc",
    });

    if (error) throw new Error(`[supabase] messages.list failed: ${error.message}`);

    const rows = (data ?? []) as unknown as MessageRow[];
    return {
      data: rows.map(rowToMessage),
      total: (page - 1) * pageSize + rows.length,
      page,
      pageSize,
    };
  },

  async send(conversationId: ID, input: MessageSendInput): Promise<IMessage> {
    const id: ID = crypto.randomUUID();
    const now = new Date().toISOString();
    const row = {
      id,
      conversation_id: conversationId,
      direction: "out" as IMessage["direction"],
      author_type: input.authorType,
      author_id: input.authorId ?? null,
      provider: "mock" as IMessage["provider"],
      text: input.text,
      media_type: input.mediaType ?? null,
      media_url: input.mediaUrl ?? null,
      status: "sent" as IMessage["status"],
      sent_at: now,
      delivered_at: input.deliveredAt ?? now,
      read_at: input.readAt ?? null,
    };
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(row)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] messages.send failed: ${error.message}`);
    return rowToMessage(data as unknown as MessageRow);
  },

  async markStatus(messageId: ID, status: IMessage["status"]): Promise<IMessage> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ status })
      .eq("id", messageId)
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] messages.markStatus(${messageId}) failed: ${error.message}`);
    return rowToMessage(data as unknown as MessageRow);
  },

  async simulateIncoming(
    conversationId: ID,
    text?: string,
    mediaType?: MessageMediaType,
  ): Promise<IMessage> {
    // Mock-only affordance used to drive the real-time inbox demo. The Supabase
    // backend receives genuine inbound traffic via a WhatsApp webhook in Fase 2
    // (PRD-100+); until then this synthesizes an in-memory message without
    // persisting it, mirroring the no-op contract note.
    const now = new Date().toISOString();
    return {
      id: `msg-${crypto.randomUUID()}`,
      conversationId,
      direction: "in",
      authorType: "customer",
      provider: "mock",
      text: text ?? "Você ainda tem essa peça em estoque?",
      mediaType,
      mediaUrl: mediaType ? `mock-inbound-${mediaType}.jpg` : undefined,
      status: "delivered",
      sentAt: now,
      deliveredAt: now,
      readAt: undefined,
    };
  },

  async listForAnalytics(params: IListMessagesForAnalyticsParams = {}): Promise<IMessage[]> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS);

    if (params.conversationIds && params.conversationIds.length > 0) {
      query = query.in("conversation_id", params.conversationIds);
    }
    if (params.since) query = query.gte("sent_at", params.since);
    if (params.until) query = query.lte("sent_at", params.until);

    const { data, error } = await query.order("sent_at", { ascending: true });
    if (error) throw new Error(`[supabase] messages.listForAnalytics failed: ${error.message}`);
    return (data as unknown as MessageRow[]).map(rowToMessage);
  },

  async getLastInboundAt(conversationId: ID): Promise<string | null> {
    // SECURITY INVOKER RPC (PRD-117): RLS on messages applies, so an invisible
    // conversation resolves to null and the UI treats the window as closed.
    const { data, error } = await getSupabaseClient().rpc("last_inbound_at", {
      p_conversation_id: conversationId,
    });
    if (error)
      throw new Error(
        `[supabase] messages.getLastInboundAt(${conversationId}) failed: ${error.message}`,
      );
    return (data as string | null) ?? null;
  },

  async resolveMediaUrl(mediaUrl: string | undefined): Promise<string | null> {
    const ref = classifyMediaRef(mediaUrl);
    if (ref.kind === "none") return null;
    // Resolve the object path to sign: a bare `whatsapp-media` path (inbound,
    // written by the webhook) or one recovered from a previously persisted
    // signed URL of our own bucket (outbound media stored a short-lived signed
    // URL at send time — re-sign it fresh so it doesn't render as a dead link).
    const objectPath = ref.kind === "storage" ? ref.path : whatsappMediaObjectPath(ref.url);
    // A genuinely external URL (seed/mock assets) — use it verbatim.
    if (!objectPath) return ref.kind === "absolute" ? ref.url : null;
    // Sign it. The `storage_whatsapp_media_select*` policies gate signing to the
    // conversation's store; a forbidden/absent object resolves to null so the
    // bubble degrades to an "unavailable" state instead of throwing.
    const { data, error } = await getSupabaseClient()
      .storage.from(MEDIA_BUCKET)
      .createSignedUrl(objectPath, MEDIA_SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  },

  async resolveMediaUrls(refs: string[]): Promise<Record<string, string | null>> {
    const plan = partitionMediaRefs(refs);
    const out: Record<string, string | null> = {};
    for (const { ref, url } of plan.passthrough) out[ref] = url;
    for (const ref of plan.unavailable) out[ref] = null;
    if (plan.toSign.length === 0) return out;

    // Sign every private object in one request. Dedup object paths (two refs
    // could point at the same object) so the batch stays minimal; map results
    // back to each ref by its object path.
    const uniquePaths = Array.from(new Set(plan.toSign.map((s) => s.objectPath)));
    const { data, error } = await getSupabaseClient()
      .storage.from(MEDIA_BUCKET)
      .createSignedUrls(uniquePaths, MEDIA_SIGNED_URL_TTL_SECONDS);
    const urlByPath = new Map<string, string | null>();
    if (!error && data) {
      for (const row of data) {
        if (row.path) urlByPath.set(row.path, row.error ? null : (row.signedUrl ?? null));
      }
    }
    for (const { ref, objectPath } of plan.toSign) {
      out[ref] = urlByPath.has(objectPath) ? (urlByPath.get(objectPath) ?? null) : null;
    }
    return out;
  },

  async listConversationMedia(conversationId: ID): Promise<IMessage[]> {
    // `media_url IS NOT NULL` already excludes failed/expired inbound media
    // (the webhook stores a null url on download failure), so a status filter
    // is unnecessary and would wrongly drop outbound media (null status).
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("conversation_id", conversationId)
      .not("media_type", "is", null)
      .not("media_url", "is", null)
      .order("sent_at", { ascending: false })
      .limit(500);
    if (error)
      throw new Error(`[supabase] messages.listConversationMedia failed: ${error.message}`);
    return (data as unknown as MessageRow[]).map(rowToMessage);
  },

  async listCustomerMedia(customerId: ID): Promise<IMessage[]> {
    // Inner-join conversations so we can filter by the owning customer across
    // ALL of their conversations (the fiche "Mídias" tab). Same media filters
    // as listConversationMedia; the embedded `conversations` field is ignored
    // by rowToMessage.
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(`${COLUMNS}, conversations!inner(customer_id)`)
      .eq("conversations.customer_id", customerId)
      .not("media_type", "is", null)
      .not("media_url", "is", null)
      .order("sent_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(`[supabase] messages.listCustomerMedia failed: ${error.message}`);
    return (data as unknown as MessageRow[]).map(rowToMessage);
  },

  async listLastMessages(conversationIds: ID[]): Promise<IMessage[]> {
    if (conversationIds.length === 0) return [];
    // SECURITY DEFINER RPC: one LATERAL limit-1 per conversation (rides the
    // (conversation_id, sent_at) index), gated by can_access_conversation over
    // the bounded id list. Replaces ~50 concurrent per-conversation reads that
    // each re-evaluated the access gate and saturated the backend for a seller.
    const { data, error } = await getSupabaseClient().rpc("last_messages_for_conversations", {
      p_ids: conversationIds,
    });
    if (error) throw new Error(`[supabase] messages.listLastMessages failed: ${error.message}`);
    return (data as unknown as MessageRow[]).map(rowToMessage);
  },
};
