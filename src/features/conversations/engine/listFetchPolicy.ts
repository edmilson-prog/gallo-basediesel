/**
 * Pure decision rules for the Inbox conversations-list fetch lifecycle
 * (consumed by useConversationsList).
 *
 * Context (2026-07-02 incident): the hook had a single error state with no
 * retry — ANY failed fetch (including invisible realtime-tick re-hydrations)
 * replaced an already-loaded list with the full-panel error. These rules keep
 * the panel reserved for "we have nothing to show", make the first load retry
 * once, and derive pagination from page fullness instead of a server total.
 */

export type ListFetchMode = "replace" | "append";

export type ListFailureAction = "surface" | "silent";

/** First load (empty screen) gets 1 retry; everything else fails silently. */
export const INITIAL_LOAD_MAX_ATTEMPTS = 2;

/** Delay between first-load attempts — long enough to skip a transient blip. */
export const INITIAL_LOAD_RETRY_DELAY_MS = 400;

/**
 * Whether a failed fetch should surface the full error panel or keep the
 * current (stale) list on screen. Only a replace that leaves the user with
 * an empty screen deserves the panel.
 */
export function resolveListFetchFailure(input: {
  fetchMode: ListFetchMode;
  hasItems: boolean;
}): ListFailureAction {
  return input.fetchMode === "replace" && !input.hasItems ? "surface" : "silent";
}

/**
 * Retry only the visible first load. Background refetches self-heal on the
 * next realtime tick, and retrying them would amplify load storms — the very
 * condition that triggers the server-side timeout.
 */
export function shouldRetryListFetch(input: {
  fetchMode: ListFetchMode;
  hasItems: boolean;
  attempt: number;
}): boolean {
  return (
    input.fetchMode === "replace" &&
    !input.hasItems &&
    input.attempt < INITIAL_LOAD_MAX_ATTEMPTS
  );
}

/**
 * Cursor-style hasMore: a full raw page (before id-dedup) means there may be
 * another one. Replaces `items.length < total` so pagination no longer
 * depends on the exact server total.
 */
export function nextHasMore(rawPageLength: number, pageSize: number): boolean {
  return rawPageLength >= pageSize;
}
