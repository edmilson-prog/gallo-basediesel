/**
 * Pure decision rules for the Inbox conversations-list fetch lifecycle
 * (consumed by useConversationsList).
 *
 * Context (2026-07-02 incident + review follow-up): the hook started with a
 * single error state and no retry — ANY failed fetch replaced an already-loaded
 * list with the full-panel error. The first fix over-corrected: EVERY
 * non-initial failure became silent, which let (a) a failed infinite-scroll
 * append advance the page and skip 30 rows invisibly while auto-looping against
 * the degraded server, and (b) a failed post-mutation refetch keep a stale list
 * with no feedback.
 *
 * These rules split the fetch by INTENT so each failure gets the right response:
 *   - "initial"   — the blank first load: surface the panel, retry once.
 *   - "refetch"   — a user-triggered replace over a populated list (retry
 *                   button / post-mutation / post-create): retry once, then keep
 *                   the rows (a realtime tick is the backstop) — never blank the
 *                   screen.
 *   - "load-more" — an infinite-scroll append: never auto-retry (that would
 *                   hammer the very timeout it rides on); the hook raises a
 *                   MANUAL retry affordance instead and does NOT advance the
 *                   page on failure.
 * Realtime re-hydration is handled by a dedicated non-destructive routine in the
 * hook (buffer 1..N, commit once) and does not flow through these intent rules.
 */

export type ListFetchIntent = "initial" | "load-more" | "refetch";

export type ListFetchPlacement = "replace" | "append";

export type ListFailureAction = "surface" | "silent";

/** Initial load / refetch get 1 retry; load-more never auto-retries. */
export const INITIAL_LOAD_MAX_ATTEMPTS = 2;

/** Delay between retry attempts — long enough to skip a transient blip. */
export const INITIAL_LOAD_RETRY_DELAY_MS = 400;

/**
 * Where an intent's rows land (and which loading flag it drives). Only the
 * infinite-scroll append adds to the list; every other intent replaces it.
 */
export function placementForIntent(intent: ListFetchIntent): ListFetchPlacement {
  return intent === "load-more" ? "append" : "replace";
}

/**
 * Whether a failed fetch should surface the full error panel or keep the
 * current (stale) rows on screen. Only the initial load of an empty screen
 * deserves the panel — anything with rows already visible stays silent so a
 * background/secondary failure never blanks a working list.
 */
export function resolveListFetchFailure(input: {
  intent: ListFetchIntent;
  hasItems: boolean;
}): ListFailureAction {
  return input.intent === "initial" && !input.hasItems ? "surface" : "silent";
}

/**
 * Retry only the blank first load and a user-triggered refetch. A failed
 * load-more must NOT auto-retry (it would amplify load during the exact
 * server-side timeout it rides on — the UI offers a manual retry instead);
 * realtime re-hydration retries itself on the next tick.
 */
export function shouldRetryListFetch(input: {
  intent: ListFetchIntent;
  hasItems: boolean;
  attempt: number;
}): boolean {
  if (input.attempt >= INITIAL_LOAD_MAX_ATTEMPTS) return false;
  if (input.intent === "initial") return !input.hasItems;
  return input.intent === "refetch";
}

/**
 * The one intent whose failure raises a MANUAL "load more failed" retry
 * affordance (and must not reopen the auto infinite-scroll gate). Keeping this
 * a named predicate lets the hook branch on it without re-deriving the rule.
 */
export function isLoadMoreFailure(intent: ListFetchIntent): boolean {
  return intent === "load-more";
}

/**
 * Cursor-style hasMore: a full raw page (before id-dedup) means there may be
 * another one. Replaces `items.length < total` so pagination no longer depends
 * on the exact server total.
 */
export function nextHasMore(rawPageLength: number, pageSize: number): boolean {
  return rawPageLength >= pageSize;
}

/**
 * List-mode fetches that routed through a search RPC already carry the real
 * total (>= 0); the plain no-search path returns the -1 sentinel
 * (withTotal: false). Adopting a non-negative total directly avoids calling
 * count() with `search` set.
 */
export function shouldAdoptResultTotal(resultTotal: number): boolean {
  return resultTotal >= 0;
}

/**
 * The async count RPC refresh runs only when the fetch could not supply a total
 * (the -1 sentinel) and this is the page-1 replace that anchors the view —
 * appends never re-count.
 */
export function shouldRefreshTotalViaCount(input: {
  resultTotal: number;
  placement: ListFetchPlacement;
  pageToLoad: number;
}): boolean {
  return input.resultTotal < 0 && input.placement === "replace" && input.pageToLoad === 1;
}
