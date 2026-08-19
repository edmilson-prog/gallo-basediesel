import { useEffect } from "react";
import type { ID, IMessage, IMessageReplyRef } from "@/shared/types";
import { getActiveDataSource } from "@/providers/data";
import { subscribeToTable } from "@/shared/lib/realtime";

/** Build-time data source — the hook is a no-op on the mock simulator. */
const IS_SUPABASE = getActiveDataSource() === "supabase";

/**
 * Raw `public.messages` row as delivered by Realtime postgres_changes.
 * Exported for `useRelatedEntities`, which patches Inbox row previews from the
 * same shared `messages` channel (status-only updates, see `rowToMessage`).
 */
export interface IMessageRealtimeRow {
  id: string;
  conversation_id: string;
  direction: IMessage["direction"];
  author_type: IMessage["authorType"];
  author_id: string | null;
  provider: IMessage["provider"];
  text: string;
  media_type: IMessage["mediaType"] | null;
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
  reactions: IMessage["reactions"] | null;
  reply_to: IMessageReplyRef | null;
}

/** Debounce window collapsing a burst of conversation touches into one sync. */
const TOUCH_REFETCH_DEBOUNCE_MS = 250;

/** True when a `messages` Realtime row belongs to the open conversation. */
export function messageRowMatches(
  row: Partial<IMessageRealtimeRow> | null | undefined,
  conversationId: ID,
): boolean {
  return Boolean(row?.id) && row?.conversation_id === conversationId;
}

/** True when a `conversations` Realtime row is the open conversation (a touch). */
export function conversationTouchMatches(row: unknown, conversationId: ID): boolean {
  const id = (row as { id?: string } | null | undefined)?.id;
  return Boolean(id) && id === conversationId;
}

/**
 * Local snake_case mapper. The supabase provider has an equivalent private
 * one, but provider impls are not importable outside `providers/data`
 * (ESLint boundary) — and this hook receives raw Realtime payloads, which
 * never pass through the provider.
 */
export function rowToMessage(row: IMessageRealtimeRow): IMessage {
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
    replyTo: row.reply_to ?? undefined,
    status: row.status,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at ?? undefined,
    readAt: row.read_at ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    failureCode: row.failure_code ?? undefined,
    transcription: row.transcription ?? undefined,
    transcriptionStatus: row.transcription_status ?? undefined,
    // Mapped from the row (never a fixed `undefined`): `payload.new` always
    // carries the full current row, so a status-only ack UPDATE still carries
    // the reaction value unchanged — a fixed `undefined` here would clear the
    // chip on every such transition.
    reactions: row.reactions ?? undefined,
  };
}

/**
 * Live message stream of the OPEN conversation (PRD-118 RF-021, RNF-001).
 *
 * Subscribes to `public.messages` postgres_changes (shared ref-counted
 * channel, PRD-105 — RLS scopes events server-side) and upserts rows of this
 * conversation into the local cache:
 *   - INSERT: inbound from the webhook (PRD-114) appends in place; the 24h
 *     window recomputes via `useMetaWindow` (PRD-117).
 *   - UPDATE: delivery transitions (sent → delivered → read | failed) patch
 *     the bubble badge live, including failure_reason/failure_code.
 *
 * Mock source: no-op — the Fase-1 simulator drives the demo.
 *
 * Takes `apply` directly (instead of the ConversationContext) so the page can
 * wire it before the provider mounts. `apply`'s second argument flags an
 * UPDATE event so a stale row outside the loaded pages (e.g. a reaction on a
 * months-old message) isn't misapplied as a new row (see `applyRealtimeRow`).
 *
 * Fallback (`syncLatest`): the `messages` postgres_changes channel can miss
 * INSERTs on this high-volume table — its per-row RLS evaluation over
 * `can_access_conversation` is the same cost wall the SELECT path had to
 * optimize, and the Realtime authorizer doesn't share that optimization — while
 * the `conversations` channel reliably delivers the touch (`last_message_at`
 * UPDATE) the webhook performs on every message. So this hook ALSO watches
 * `conversations` and, on a touch of THIS conversation, debounce-runs
 * `syncLatest` to merge the latest page. The open thread then catches up live
 * even when the messages channel drops the event, instead of forcing the user
 * to leave and re-enter the conversation.
 *
 * The fallback re-arms on EVERY touch unconditionally (no "already covered by
 * the fast path" skip): an earlier attempt at that optimization compared
 * `last_message_at`/`sentAt` timestamps, but those are truncated to whole
 * seconds by every provider parser, so two distinct messages in the same
 * second are indistinguishable — and a later touch's coverage doesn't prove
 * an earlier, still-uncovered touch's message was ever applied. Both gaps
 * risked silently dropping a real message from the open thread, which is
 * worse than the redundant `syncLatest` call this hook accepts instead.
 */
export function useRealtimeMessages(
  conversationId: ID,
  apply: (row: IMessage, isUpdate?: boolean) => void,
  syncLatest?: () => void | Promise<void>,
): void {
  useEffect(() => {
    if (!IS_SUPABASE) return;

    // Fast path: live INSERT/UPDATE of this conversation straight into cache.
    const offMessages = subscribeToTable("messages", (payload) => {
      const row = payload.new as Partial<IMessageRealtimeRow> | null;
      if (!messageRowMatches(row, conversationId)) return;
      apply(rowToMessage(row as IMessageRealtimeRow), payload.eventType === "UPDATE");
    });

    // Fallback: catch-up via the reliable conversations channel (debounced).
    let handle: number | undefined;
    const offConversations = syncLatest
      ? subscribeToTable("conversations", (payload) => {
          if (!conversationTouchMatches(payload.new, conversationId)) return;
          if (handle !== undefined) window.clearTimeout(handle);
          handle = window.setTimeout(() => void syncLatest(), TOUCH_REFETCH_DEBOUNCE_MS);
        })
      : undefined;

    return () => {
      offMessages();
      offConversations?.();
      if (handle !== undefined) window.clearTimeout(handle);
    };
  }, [apply, syncLatest, conversationId]);
}
