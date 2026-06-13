import type { ID, IMessage, MessageMediaType } from "@/shared/types";
import type {
  IListMessagesForAnalyticsParams,
  IListMessagesParams,
  IMessagesProvider,
} from "../../contracts/messages";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { classifyMediaRef } from "@/shared/utils/mediaRef";

/** Storage bucket holding conversation media bytes (PRD-106). */
const MEDIA_BUCKET = "whatsapp-media";
/** Signed-URL lifetime for in-app playback/preview — comfortably long so a
 *  conversation left open doesn't expire mid-listen (Storage RLS still gates). */
const MEDIA_SIGNED_URL_TTL_SECONDS = 3600;

/**
 * If a stored media ref is itself a signed/public URL of OUR `whatsapp-media`
 * bucket, pull the object path back out so it can be re-signed fresh on display.
 * Outbound media historically persisted a short-lived signed URL minted at send
 * time (~5 min), which renders as a dead link once expired; re-signing from the
 * path fixes both already-sent and future messages. Returns null for any other
 * URL (external seed/mock assets), which the caller then uses verbatim.
 * Tolerant of sign/public/authenticated URL shapes.
 */
function whatsappMediaObjectPath(rawUrl: string): string | null {
  try {
    const { pathname } = new URL(rawUrl);
    const marker = "/storage/v1/object/";
    const at = pathname.indexOf(marker);
    if (at === -1) return null;
    // e.g. "sign/whatsapp-media/<store>/<uuid>.jpg" → ["sign","whatsapp-media",…]
    const [, bucket, ...rest] = pathname.slice(at + marker.length).split("/");
    if (bucket !== MEDIA_BUCKET || rest.length === 0) return null;
    const objectPath = rest.join("/");
    return objectPath ? decodeURIComponent(objectPath) : null;
  } catch {
    return null;
  }
}

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
    const query = getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS, { count: "exact" })
      .eq("conversation_id", params.conversationId);

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("sent_at", { ascending: params.orderDir !== "desc" })
      .range(from, to);

    if (error) throw new Error(`[supabase] messages.list failed: ${error.message}`);

    return {
      data: (data as unknown as MessageRow[]).map(rowToMessage),
      total: count ?? 0,
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
};
