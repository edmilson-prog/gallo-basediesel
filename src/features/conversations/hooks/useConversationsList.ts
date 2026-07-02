import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ID, IConversation } from "@/shared/types";
import { useConversationsProvider, type IListConversationsParams } from "@/providers/data";
import { captureObservabilityException } from "@/shared/lib/observability";
import {
  INITIAL_LOAD_RETRY_DELAY_MS,
  isLoadMoreFailure,
  nextHasMore,
  placementForIntent,
  resolveListFetchFailure,
  shouldAdoptResultTotal,
  shouldRefreshTotalViaCount,
  shouldRetryListFetch,
  type ListFetchIntent,
} from "../engine/listFetchPolicy";

/** Conversations pulled per page from the provider. */
export const PAGE_SIZE = 30;

/** Debounce window collapsing a burst of realtime ticks into a single refetch. */
const REALTIME_REFETCH_DEBOUNCE_MS = 300;

/** `total` sentinel: the real count is not known yet (list mode, before the
 *  async count RPC resolves). The hook exposes the loaded-row count instead of
 *  this value so the header never shows a stale/zero number. */
const TOTAL_UNKNOWN = -1;

export interface IConversationsListState {
  items: IConversation[];
  total: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  /**
   * True when the last infinite-scroll append failed. The auto-scroll gate is
   * closed (`hasMore` is false) so the sentinel stops firing; the consumer shows
   * a manual "load more failed" retry that calls `loadMore` to try again.
   */
  loadMoreFailed: boolean;
  error: Error | null;
  loadMore: () => void;
  refetch: () => void;
  /**
   * Optimistically zero an item's unread counter (the red badge) in place,
   * without a refetch. Used when a conversation is opened so the badge clears
   * instantly; the authoritative reset is persisted by the caller via the
   * provider's `markRead`. No-ops if the item is absent or already at 0.
   */
  markItemRead: (id: ID) => void;
}

export interface IUseConversationsListOptions {
  /** Optional bump key — when it changes, the loaded pages are re-hydrated. */
  refreshKey?: number;
  /**
   * "messages" routes every fetch through `provider.searchMessages` instead of
   * `provider.list` — the dedicated "search inside messages" action (Opção D).
   * Defaults to "list".
   */
  mode?: "list" | "messages";
}

/**
 * Fetch conversations with cursor-style pagination on top of `provider.list`.
 *
 * Re-fetches page 1 whenever filters change, and re-hydrates the loaded pages
 * whenever `refreshKey` bumps (driven by `useRealtimeConversations` to keep the
 * list in sync with inbound traffic). On filter change, both pagination state
 * and the items array reset.
 *
 * Error/pagination policy lives in `../engine/listFetchPolicy` (2026-07-02
 * statement-timeout incident + review follow-up), split by fetch INTENT:
 *   - the error panel is reserved for a failed INITIAL load with an EMPTY list;
 *   - a failed load-more never advances the page and raises a MANUAL retry
 *     (`loadMoreFailed`) instead of auto-looping against the degraded server;
 *   - a failed refetch keeps the rows and retries once (realtime is the backstop);
 *   - realtime re-hydration is non-destructive: it buffers pages 1..N and commits
 *     once, so a mid-window failure keeps the current rows instead of truncating.
 *
 * In list mode the fetch opts out of the exact count (`withTotal: false` — the
 * expensive per-row-RLS count) and the header total comes from `provider.count`
 * asynchronously; hasMore derives from page fullness. Message-search mode keeps
 * the RPC-provided total.
 *
 * A generation token (bumped on filter/mode change) discards responses from
 * superseded fetches, so a slow orphan can no longer overwrite the current view.
 *
 * Loaded pages are concatenated; duplicates are de-duped by id so a slow
 * real-time refresh that races with `loadMore` cannot show the same row twice.
 */
export function useConversationsList(
  filters: IListConversationsParams,
  options: IUseConversationsListOptions = {},
): IConversationsListState {
  const provider = useConversationsProvider();

  const [items, setItems] = useState<IConversation[]>([]);
  const [total, setTotal] = useState(TOTAL_UNKNOWN);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [listHasMore, setListHasMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);

  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  const refreshKey = options.refreshKey ?? 0;
  const mode = options.mode ?? "list";
  const pageRef = useRef(page);
  pageRef.current = page;

  // Mirrors `items` for reads inside async callbacks without re-creating them.
  const itemsRef = useRef<IConversation[]>([]);
  itemsRef.current = items;

  // Bumped on every filter/mode change; fetches launched under an older
  // generation discard their response instead of touching state.
  const generationRef = useRef(0);

  /**
   * Refresh the header total via the cheap gated-once count RPC. Fire-and-
   * forget: the total is cosmetic, so a failure never surfaces — it is logged
   * (only if the view is still current) and the loaded-row count stands in.
   */
  const refreshTotal = useCallback(
    (generation: number) => {
      provider
        .count(filters)
        .then((value) => {
          if (generation !== generationRef.current) return;
          setTotal(value);
        })
        .catch((err) => {
          // Superseded views fail silently — their count describes a filter that
          // no longer exists (parity with fetchPage's generation guard).
          if (generation !== generationRef.current) return;
          captureObservabilityException(err, { source: "useConversationsList.count" });
        });
    },
    // We intentionally key on the JSON snapshot to avoid noisy re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [provider, filtersKey],
  );

  const fetchPage = useCallback(
    async (pageToLoad: number, intent: ListFetchIntent, generation: number) => {
      // Schedulers pass the generation that owned the view when the fetch was
      // SCHEDULED. A closure invoked late (debounce timer, retry sleep) after a
      // filter/mode bump therefore fails this check instead of adopting the new
      // generation and writing old-filter data into it.
      if (generation !== generationRef.current) return;
      const placement = placementForIntent(intent);
      if (placement === "replace") setIsLoading(true);
      else setIsLoadingMore(true);
      try {
        for (let attempt = 1; ; attempt += 1) {
          try {
            const fetcher = mode === "messages" ? provider.searchMessages : provider.list;
            const result = await fetcher({
              ...filters,
              page: pageToLoad,
              pageSize: PAGE_SIZE,
              // List mode skips the exact count — the per-row-RLS total was the
              // 5.3s/8s statement-timeout component of the incident.
              ...(mode === "list" ? { withTotal: false } : {}),
            });
            if (generation !== generationRef.current) return;
            setError(null);
            setLoadMoreFailed(false);
            if (mode === "messages") {
              setTotal(result.total);
            } else {
              setListHasMore(nextHasMore(result.data.length, PAGE_SIZE));
              // Search-mode list fetches (name/phone → search_conversations RPC)
              // already return the real total; adopt it instead of count(),
              // which does not support `search`.
              if (shouldAdoptResultTotal(result.total)) {
                setTotal(result.total);
              } else if (
                shouldRefreshTotalViaCount({ resultTotal: result.total, placement, pageToLoad })
              ) {
                refreshTotal(generation);
              }
            }
            if (placement === "replace") {
              setItems(result.data);
              itemsRef.current = result.data;
            } else {
              setItems((prev) => {
                const seen = new Set(prev.map((c) => c.id));
                const merged = [...prev, ...result.data.filter((c) => !seen.has(c.id))];
                itemsRef.current = merged;
                return merged;
              });
            }
            // Advance the page cursor only on a SUCCESSFUL fetch. A failed
            // load-more therefore never skips its page (it stays retryable), and
            // a failed refetch keeps the cursor consistent with the rows still
            // on screen.
            setPage(pageToLoad);
            return;
          } catch (err) {
            // Superseded fetches exit silently (no Sentry): their failure
            // describes a view that no longer exists.
            if (generation !== generationRef.current) return;
            const failure = err instanceof Error ? err : new Error(String(err));
            const hasItems = itemsRef.current.length > 0;
            if (shouldRetryListFetch({ intent, hasItems, attempt })) {
              await new Promise((resolve) =>
                window.setTimeout(resolve, INITIAL_LOAD_RETRY_DELAY_MS),
              );
              // The view may have changed during the sleep — don't waste a
              // request (and a timeout-prone round-trip) on stale filters.
              if (generation !== generationRef.current) return;
              // Transient blip we are about to retry — no Sentry yet; only the
              // FINAL outcome (below) is reported, so a self-healing first load
              // does not emit a false error event.
              continue;
            }
            captureObservabilityException(failure, {
              source: "useConversationsList",
              mode,
              intent,
              page: pageToLoad,
              attempt,
            });
            // A failed load-more raises the manual retry affordance; it never
            // advances the page (done on success only) so no rows are skipped.
            if (isLoadMoreFailure(intent)) setLoadMoreFailed(true);
            if (resolveListFetchFailure({ intent, hasItems }) === "surface") {
              setError(failure);
            }
            return;
          }
        }
      } finally {
        // A newer generation owns the loading flags now — don't clobber them.
        if (generation === generationRef.current) {
          if (placement === "replace") setIsLoading(false);
          else setIsLoadingMore(false);
        }
      }
    },
    // We intentionally key on the JSON snapshot to avoid noisy re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [provider, filtersKey, mode, refreshTotal],
  );

  /**
   * Non-destructive realtime re-hydration: build the full 1..target window in a
   * local buffer and commit it ONCE. A mid-window failure keeps the rows already
   * on screen (the next tick retries) instead of leaving a truncated list — and
   * it never flashes a 1-page list on the way. Single attempt per page:
   * re-hydration must not amplify load during the timeouts it rides on.
   */
  const rehydrate = useCallback(
    async (target: number, generation: number) => {
      if (generation !== generationRef.current) return;
      setIsLoading(true);
      try {
        const buffer: IConversation[] = [];
        const seen = new Set<ID>();
        let lastRawLen = 0;
        let anchorTotal = TOTAL_UNKNOWN;
        for (let p = 1; p <= target; p += 1) {
          const fetcher = mode === "messages" ? provider.searchMessages : provider.list;
          const result = await fetcher({
            ...filters,
            page: p,
            pageSize: PAGE_SIZE,
            ...(mode === "list" ? { withTotal: false } : {}),
          });
          if (generation !== generationRef.current) return;
          lastRawLen = result.data.length;
          if (p === 1) anchorTotal = result.total;
          for (const c of result.data) {
            if (!seen.has(c.id)) {
              seen.add(c.id);
              buffer.push(c);
            }
          }
          // The server has no more rows for this window — stop early instead of
          // requesting empty higher pages.
          if (result.data.length < PAGE_SIZE) break;
        }
        if (generation !== generationRef.current) return;
        // Commit the whole window atomically.
        setItems(buffer);
        itemsRef.current = buffer;
        setError(null);
        setLoadMoreFailed(false);
        setListHasMore(nextHasMore(lastRawLen, PAGE_SIZE));
        if (mode === "messages") {
          setTotal(anchorTotal);
        } else if (shouldAdoptResultTotal(anchorTotal)) {
          setTotal(anchorTotal);
        } else {
          refreshTotal(generation);
        }
      } catch (err) {
        // A background re-hydration failure is silent and non-destructive: keep
        // the rows already on screen; the next tick retries. Report once (not
        // per page) so the incident signal is not drowned.
        if (generation !== generationRef.current) return;
        captureObservabilityException(err, {
          source: "useConversationsList.rehydrate",
          mode,
          target,
        });
      } finally {
        if (generation === generationRef.current) setIsLoading(false);
      }
    },
    // We intentionally key on the JSON snapshot to avoid noisy re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [provider, filtersKey, mode, refreshTotal],
  );

  // Reset to page 1 whenever filters change OR the fetch mode flips
  // (list ↔ messages — see Opção D's "search inside messages" toggle).
  // Clearing `items` synchronously (not just waiting for the fetch to resolve)
  // matters specifically for the mode flip: list-mode and messages-mode rows
  // render differently (matchedMessage snippet vs. last-message preview), so
  // leaving the previous mode's rows on screen during the fetch window shows
  // them under the WRONG mode's chrome (e.g. plain rows under the "resultados
  // em mensagens" banner).
  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    setPage(1);
    setItems([]);
    itemsRef.current = [];
    // Drop the previous filter's total so the header never shows its count over
    // the new filter's list; the loaded-row count stands in until the new
    // fetch/count resolves.
    setTotal(TOTAL_UNKNOWN);
    setError(null);
    setListHasMore(false);
    setLoadMoreFailed(false);
    // An append in flight across the reset would otherwise leave this flag
    // stuck true forever (its finally is generation-guarded), permanently
    // gating loadMore and killing infinite scroll.
    setIsLoadingMore(false);
    void fetchPage(1, "initial", generation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, mode]);

  // External refresh signal — debounced so a burst of realtime events collapses
  // into a single re-hydration (~300ms after the last one) instead of N
  // sequential reloads. Re-hydrates back up to the current page so the user does
  // not lose pagination progress while real-time pulls in new rows.
  useEffect(() => {
    if (refreshKey === 0) return;
    // Capture the generation NOW: if filters/mode change during the debounce
    // window (this effect keys on refreshKey only), the timer fires a stale
    // closure — the old generation makes rehydrate bail before any request.
    const generation = generationRef.current;
    const handle = window.setTimeout(() => {
      void rehydrate(pageRef.current, generation);
    }, REALTIME_REFETCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Raw "there are more pages" signal; the exposed `hasMore` folds in the
  // error/failed guards so no consumer can reopen the infinite-scroll loop.
  const moreAvailable = mode === "messages" ? items.length < total : listHasMore;
  const hasMore = error === null && !loadMoreFailed && moreAvailable;

  const loadMore = useCallback(() => {
    if (isLoading || isLoadingMore) return;
    // Check raw availability, not the folded `hasMore`: this is also the manual
    // retry entry point (the failed-load footer button), which must fire while
    // `loadMoreFailed` is still true. It clears the flag before retrying.
    if (!moreAvailable) return;
    setLoadMoreFailed(false);
    void fetchPage(page + 1, "load-more", generationRef.current);
  }, [isLoading, isLoadingMore, moreAvailable, page, fetchPage]);

  const refetch = useCallback(() => {
    if (isLoading) return;
    // Clearing the panel (and showing the spinner) is what the "Tentar novamente"
    // button needs; on a populated list this is a no-op.
    setError(null);
    setLoadMoreFailed(false);
    // With rows on screen this is a re-anchor (retry once, keep rows on failure);
    // from a blank/error screen it behaves like the initial load (surface again).
    const intent: ListFetchIntent = itemsRef.current.length === 0 ? "initial" : "refetch";
    void fetchPage(1, intent, generationRef.current);
  }, [isLoading, fetchPage]);

  const markItemRead = useCallback((id: ID) => {
    setItems((prev) =>
      prev.map((c) => (c.id === id && c.unreadCount > 0 ? { ...c, unreadCount: 0 } : c)),
    );
  }, []);

  return {
    items,
    // Fall back to the loaded-row count while the real total is unknown (list
    // mode before count() resolves, or if count() fails) — never expose the
    // sentinel or a stale value.
    total: total >= 0 ? total : items.length,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMoreFailed,
    error,
    loadMore,
    refetch,
    markItemRead,
  };
}
