/** Ignore realtime events older than this — guards against import/backfill storms. */
export const MAX_EVENT_AGE_MS = 60_000;
/** Minimum gap between two beeps of the same kind. */
export const MIN_BEEP_INTERVAL_MS = 1_500;
/** Debounce window for the `conversations` touch fallback (mirrors useRealtimeMessages.ts). */
export const CONVERSATION_TOUCH_DEBOUNCE_MS = 250;
