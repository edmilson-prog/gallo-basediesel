import { useEffect } from "react";
import type { ID, IMessage } from "@/shared/types";
import { getActiveDataSource } from "@/providers/data";
import { subscribeToTable } from "@/shared/lib/realtime";

/** Build-time data source — the hook is a no-op on the mock simulator. */
const IS_SUPABASE = getActiveDataSource() === "supabase";

/** Raw `public.messages` row as delivered by Realtime postgres_changes. */
interface IMessageRealtimeRow {
  id: string;
  conversation_id: string;
  direction: IMessage["direction"];
  author_type: IMessage["authorType"];
  author_id: string | null;
  provider: IMessage["provider"];
  text: string;
  media_type: IMessage["mediaType"] | null;
  media_url: string | null;
  status: IMessage["status"];
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  failure_reason: string | null;
  failure_code: string | null;
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

/** The touched conversation's `last_message_at`, when present on the row. */
export function conversationTouchedAt(row: unknown): string | undefined {
  return (row as { last_message_at?: string } | null | undefined)?.last_message_at ?? undefined;
}

/**
 * True when the fast `messages` path already delivered the row this touch
 * represents, so the `conversations` fallback's `syncLatest` would be
 * redundant. Compares the touch's `last_message_at` against the newest
 * `sentAt` this hook has already applied via the fast path.
 */
export function touchAlreadyCovered(
  touchedAt: string | undefined,
  latestAppliedSentAt: string | undefined,
): boolean {
  if (!touchedAt || !latestAppliedSentAt) return false;
  return touchedAt <= latestAppliedSentAt;
}

/**
 * Local snake_case mapper. The supabase provider has an equivalent private
 * one, but provider impls are not importable outside `providers/data`
 * (ESLint boundary) — and this hook receives raw Realtime payloads, which
 * never pass through the provider.
 */
function rowToMessage(row: IMessageRealtimeRow): IMessage {
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
 * wire it before the provider mounts.
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
 * The fallback skips (or cancels an already-armed) `syncLatest` once the fast
 * path has provably caught up (`touchAlreadyCovered`) — a touch never SKIPS
 * speculatively, only when the newest applied `sentAt` already covers it, so
 * convergence is never weakened, just the redundant re-fetch it would cause.
 */
export function useRealtimeMessages(
  conversationId: ID,
  apply: (row: IMessage) => void,
  syncLatest?: () => void | Promise<void>,
): void {
  useEffect(() => {
    if (!IS_SUPABASE) return;

    // Newest `sentAt` applied via the fast path — lets the `conversations`
    // touch fallback recognize when it would be a redundant re-fetch.
    let latestAppliedSentAt: string | undefined;

    // Fast path: live INSERT/UPDATE of this conversation straight into cache.
    const offMessages = subscribeToTable("messages", (payload) => {
      const row = payload.new as Partial<IMessageRealtimeRow> | null;
      if (!messageRowMatches(row, conversationId)) return;
      const message = rowToMessage(row as IMessageRealtimeRow);
      if (!latestAppliedSentAt || message.sentAt > latestAppliedSentAt) {
        latestAppliedSentAt = message.sentAt;
      }
      apply(message);
    });

    // Fallback: catch-up via the reliable conversations channel (debounced).
    let handle: number | undefined;
    const offConversations = syncLatest
      ? subscribeToTable("conversations", (payload) => {
          if (!conversationTouchMatches(payload.new, conversationId)) return;
          if (touchAlreadyCovered(conversationTouchedAt(payload.new), latestAppliedSentAt)) {
            // Fast path already delivered this touch's row — cancel any
            // still-pending sync from an earlier, not-yet-covered touch.
            if (handle !== undefined) {
              window.clearTimeout(handle);
              handle = undefined;
            }
            return;
          }
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
