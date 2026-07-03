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

/**
 * Concurrency model (2026-07-02 review round 2). The list has two fetch drivers
 * that must never corrupt each other's commits:
 *   - USER fetches (initial / load-more / refetch) — mutually exclusive, and
 *   - a BACKGROUND realtime re-hydration — SUBORDINATE: it runs only when the
 *     list is idle and discards its commit the moment a user fetch touches state.
 *
 * The first fix used React STATE flags (isLoading/isLoadingMore) to gate these,
 * but state lags a render — a load-more that had just called setIsLoadingMore(true)
 * was still invisible to a re-hydration firing in the same tick, so both committed
 * and one clobbered the other. These predicates are driven by synchronous REFS in
 * the hook instead (an in-flight COUNTER incremented before the first await, and a
 * monotonic SEQ bumped on every user-fetch start), so the decision never races a
 * pending render. State flags are now used only for rendering (spinners).
 */

/**
 * A user fetch (load-more / refetch) may start only when no other user fetch is
 * in flight — the SAME gate for both so they can never interleave (an asymmetric
 * guard let a refetch race a load-more and gap the list). A user fetch does NOT
 * wait for a background re-hydration: it supersedes it.
 */
export function canStartUserFetch(input: { userFetchInFlight: boolean }): boolean {
  return !input.userFetchInFlight;
}

/**
 * The background re-hydration starts only when the list is fully idle: no user
 * fetch in flight (so it cannot clobber pagination) and no other re-hydration (so
 * bursts don't stack N sequential fetches). It never sets the loading flags, so it
 * never blocks a user action.
 */
export function shouldStartRehydrate(input: {
  userFetchInFlight: boolean;
  rehydrateInFlight: boolean;
}): boolean {
  return !input.userFetchInFlight && !input.rehydrateInFlight;
}

/**
 * A re-hydration discards its buffered commit if the view moved on during its
 * run: a filter/mode change (generation), a user fetch currently in flight, or a
 * user fetch that started-and-settled since it began (seq changed). Any of these
 * means a user fetch owns the list now — the re-hydration must not overwrite it.
 */
export function isRehydrateSuperseded(input: {
  generation: number;
  currentGeneration: number;
  userFetchInFlight: boolean;
  userFetchSeqAtStart: number;
  currentUserFetchSeq: number;
}): boolean {
  return (
    input.generation !== input.currentGeneration ||
    input.userFetchInFlight ||
    input.userFetchSeqAtStart !== input.currentUserFetchSeq
  );
}
