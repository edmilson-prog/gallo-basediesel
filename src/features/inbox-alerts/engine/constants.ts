/** Ignore realtime events older than this — guards against import/backfill storms. */
export const MAX_EVENT_AGE_MS = 60_000;
/** Minimum gap between two beeps of the same kind. */
export const MIN_BEEP_INTERVAL_MS = 1_500;
/** Debounce window for the `conversations` touch fallback (mirrors useRealtimeMessages.ts). */
export const CONVERSATION_TOUCH_DEBOUNCE_MS = 250;
/**
 * Debounce window for the authoritative badge re-queries (queue/mine). Coalesces
 * a burst of Realtime events into at most one query per signal per window.
 */
export const SIGNAL_REVALIDATE_DEBOUNCE_MS = 250;
/**
 * Page size when scanning the seller's own conversations for the "unread mine"
 * signal. Unread conversations carry the most recent `last_message_at` and sort
 * to the top of this window, so a seller is not realistically past this cap on
 * their own actively-unread threads. The QUEUE signal never uses a windowed scan
 * — it reads count() (the count_conversations RPC) instead (see
 * useInboxActivityMonitor).
 */
export const MINE_SCAN_PAGE_SIZE = 200;
