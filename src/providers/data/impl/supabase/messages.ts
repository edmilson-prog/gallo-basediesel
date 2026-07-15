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
import { chunk } from "@/shared/utils/chunk";
import { drainPaged } from "@/shared/utils/paginate";

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
  media_filename: string | null;
  status: IMessage["status"];
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  failure_reason: string | null;
  failure_code: string | null;
  transcription: string | null;
  transcription_status: IMessage["transcriptionStatus"] | null;
  created_at: string;
}

const TABLE = "messages";
const COLUMNS =
  "id, conversation_id, direction, author_type, author_id, provider, text, media_type, " +
  "media_url, media_filename, status, sent_at, delivered_at, read_at, failure_reason, failure_code, " +
  "transcription, transcription_status, created_at";
/** Cap on ids per `.in("conversation_id", …)` so the request-line length stays
 *  well under the edge's URL limit (~39 chars/id encoded → 120 ids ≈ 4.7 KB). */
const ANALYTICS_IN_CHUNK_SIZE = 120;

/** Rows per `.range()` page when draining a batch. Must stay ≤ the PostgREST
 *  `Max rows` cap (Supabase default 1000) — a page that comes back capped below
 *  this size would be mistaken for the last page and silently under-fetch. */
const ANALYTICS_PAGE_SIZE = 1000;

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
    mediaFilename: row.media_filename ?? undefined,
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
    transcription: row.transcription ?? undefined,
    transcriptionStatus: row.transcription_status ?? undefined,
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
      media_filename: input.mediaFilename ?? null,
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
    const ids = params.conversationIds ?? [];

    // Run a windowed analytics query, draining every page so a batch with more
    // than the PostgREST `Max rows` cap (default 1000) isn't silently truncated.
    // `batch` scopes by conversation_id (null = no conversation filter). A stable
    // TOTAL order `(sent_at, id)` is REQUIRED for `.range()` to page correctly —
    // without a unique tiebreak, row order across pages is undefined and the
    // boundaries could dup/skip. NOTE: offset paging is not snapshot-consistent —
    // a DELETE of an earlier-ordered row mid-drain shifts later offsets and can
    // skip one boundary row. Accepted here: analytics is an approximate read,
    // message deletes are rare, and a batch must exceed 1000 rows to page at all.
    // Shared by both paths so a future filter can't diverge between them; the same
    // `(sent_at, id)` total order is re-applied across batches by `sortBySentAt`.
    const fetchRows = (batch: string[] | null): Promise<MessageRow[]> =>
      drainPaged<MessageRow>(async (offset, limit) => {
        let query = getSupabaseClient().from(TABLE).select(COLUMNS);
        if (batch) query = query.in("conversation_id", batch);
        if (params.since) query = query.gte("sent_at", params.since);
        if (params.until) query = query.lte("sent_at", params.until);
        const { data, error } = await query
          .order("sent_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + limit - 1);
        if (error) throw new Error(`[supabase] messages.listForAnalytics failed: ${error.message}`);
        return (data ?? []) as unknown as MessageRow[];
      }, ANALYTICS_PAGE_SIZE);

    // Sort by the SAME total order the DB pages use — `sent_at` then `id` as the
    // tiebreak — so the cross-batch/cross-page merge reproduces the per-page
    // `(sent_at, id)` order deterministically (rows sharing a sent_at would
    // otherwise land in concat/page order). One ordering source of truth for BOTH
    // paths. Sorts a copy (the empty-ids path would otherwise mutate the live
    // supabase-js response array in place). Byte-wise comparison (ISO 8601 and
    // uuid are monotonic) rather than locale-sensitive.
    const sortBySentAt = (rows: MessageRow[]): MessageRow[] =>
      [...rows].sort((a, b) => {
        if (a.sent_at !== b.sent_at) return a.sent_at < b.sent_at ? -1 : 1;
        if (a.id !== b.id) return a.id < b.id ? -1 : 1;
        return 0;
      });

    // No conversation filter → drain the whole window with no `.in()` scope (an
    // empty id set scans all messages in the window, not zero rows). NOTE: unlike
    // the pre-pagination code (which the edge silently capped at `Max rows`), this
    // now FULLY drains an unscoped window. Both current callers guard against it
    // (they only call with a non-empty id set), so the unbounded scan is unreachable
    // today — keep that guard if you add a caller.
    if (ids.length === 0) {
      return sortBySentAt(await fetchRows(null)).map(rowToMessage);
    }

    // Chunk the `.in("conversation_id", …)` so a store-wide id set never overflows
    // the request-line length (a single oversized `.in()` is rejected at the edge
    // with 400 before RLS). Dedup first so chunks are provably disjoint by
    // conversation_id (a duplicate id straddling a chunk boundary would otherwise
    // dup that conversation's rows — SQL `IN` only dedups within one query, not
    // across batches). The in-memory sort above re-orders the merged union.
    const batches = chunk([...new Set(ids)], ANALYTICS_IN_CHUNK_SIZE);
    const results = await Promise.all(batches.map((batch) => fetchRows(batch)));
    return sortBySentAt(results.flat()).map(rowToMessage);
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

  async retryTranscription(messageId) {
    const { error } = await getSupabaseClient().functions.invoke("audio-transcribe", {
      body: { messageId },
    });
    if (error) throw new Error(`[supabase] messages.retryTranscription failed: ${error.message}`);
  },
};
