import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ID, IConversation } from "@/shared/types";
import { useConversationsProvider, type IListConversationsParams } from "@/providers/data";
import { captureObservabilityException } from "@/shared/lib/observability";
import {
  INITIAL_LOAD_RETRY_DELAY_MS,
  nextHasMore,
  resolveListFetchFailure,
  shouldRetryListFetch,
  type ListFetchMode,
} from "../engine/listFetchPolicy";

/** Conversations pulled per page from the provider. */
export const PAGE_SIZE = 30;

/** Debounce window collapsing a burst of realtime ticks into a single refetch. */
const REALTIME_REFETCH_DEBOUNCE_MS = 300;

export interface IConversationsListState {
  items: IConversation[];
  total: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
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
  /** Optional bump key — when it changes, page 1 is refetched in place. */
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
 * Re-fetches the first page whenever filters change or `refreshKey` bumps
 * (the latter is driven by `useRealtimeConversations` to keep the list in
 * sync with inbound traffic). On filter change, both pagination state and the
 * items array reset.
 *
 * Error/pagination policy lives in `../engine/listFetchPolicy` (2026-07-02
 * statement-timeout incident): the error panel is reserved for a failed
 * replace with an EMPTY list — background failures keep the stale rows and
 * are reported to Sentry; the first load retries once. In list mode the
 * fetch opts out of the exact count (`withTotal: false` — the expensive
 * per-row-RLS count) and the header total comes from `provider.count`
 * asynchronously; hasMore derives from page fullness. Message-search mode
 * keeps the RPC-provided total.
 *
 * A generation token (bumped on filter/mode change) discards responses from
 * superseded fetches, so a slow orphan can no longer overwrite the state of
 * the current view.
 *
 * Loaded pages are concatenated; duplicates are de-deduped by id so a slow
 * real-time refresh that races with `loadMore` cannot show the same row
 * twice.
 */
export function useConversationsList(
  filters: IListConversationsParams,
  options: IUseConversationsListOptions = {},
): IConversationsListState {
  const provider = useConversationsProvider();

  const [items, setItems] = useState<IConversation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [listHasMore, setListHasMore] = useState(false);

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
   * forget: the total is cosmetic, so a failure must never surface — it is
   * logged and the previous value stays.
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
          captureObservabilityException(err, { source: "useConversationsList.count" });
        });
    },
    // We intentionally key on the JSON snapshot to avoid noisy re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [provider, filtersKey],
  );

  const fetchPage = useCallback(
    async (pageToLoad: number, fetchMode: ListFetchMode) => {
      const generation = generationRef.current;
      if (fetchMode === "replace") setIsLoading(true);
      else setIsLoadingMore(true);
      try {
        for (let attempt = 1; ; attempt += 1) {
          try {
            const fetcher = mode === "messages" ? provider.searchMessages : provider.list;
            const result = await fetcher({
              ...filters,
              page: pageToLoad,
              pageSize: PAGE_SIZE,
              // List mode skips the exact count — the per-row-RLS total was
              // the 5.3s/8s statement-timeout component of the incident.
              ...(mode === "list" ? { withTotal: false } : {}),
            });
            if (generation !== generationRef.current) return;
            setError(null);
            if (mode === "messages") {
              setTotal(result.total);
            } else {
              setListHasMore(nextHasMore(result.data.length, PAGE_SIZE));
              if (fetchMode === "replace" && pageToLoad === 1) refreshTotal(generation);
            }
            if (fetchMode === "replace") {
              setItems(result.data);
            } else {
              setItems((prev) => {
                const seen = new Set(prev.map((c) => c.id));
                return [...prev, ...result.data.filter((c) => !seen.has(c.id))];
              });
            }
            return;
          } catch (err) {
            if (generation !== generationRef.current) return;
            const failure = err instanceof Error ? err : new Error(String(err));
            const hasItems = itemsRef.current.length > 0;
            captureObservabilityException(failure, {
              source: "useConversationsList",
              mode,
              fetchMode,
              page: pageToLoad,
              attempt,
            });
            if (shouldRetryListFetch({ fetchMode, hasItems, attempt })) {
              await new Promise((resolve) =>
                window.setTimeout(resolve, INITIAL_LOAD_RETRY_DELAY_MS),
              );
              continue;
            }
            if (resolveListFetchFailure({ fetchMode, hasItems }) === "surface") {
              setError(failure);
            }
            return;
          }
        }
      } finally {
        // A newer generation owns the loading flags now — don't clobber them.
        if (generation === generationRef.current) {
          if (fetchMode === "replace") setIsLoading(false);
          else setIsLoadingMore(false);
        }
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
    setPage(1);
    setItems([]);
    itemsRef.current = [];
    setError(null);
    setListHasMore(false);
    void fetchPage(1, "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, mode]);

  // External refresh signal — debounced so a burst of realtime events collapses
  // into a single refetch (~300ms after the last one) instead of N sequential
  // reloads. Fetches back up to the current page so the user doesn't lose
  // pagination progress while real-time pulls in new rows.
  useEffect(() => {
    if (refreshKey === 0) return;
    const handle = window.setTimeout(() => {
      const target = pageRef.current;
      void fetchPage(1, "replace").then(() => {
        // Re-hydrate higher pages sequentially.
        let chain: Promise<void> = Promise.resolve();
        for (let p = 2; p <= target; p += 1) {
          const captured = p;
          chain = chain.then(() => fetchPage(captured, "append"));
        }
        return chain;
      });
    }, REALTIME_REFETCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const hasMore = mode === "messages" ? items.length < total : listHasMore;

  const loadMore = useCallback(() => {
    if (isLoading || isLoadingMore) return;
    if (!hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    void fetchPage(nextPage, "append");
  }, [isLoading, isLoadingMore, hasMore, page, fetchPage]);

  const refetch = useCallback(() => {
    setPage(1);
    void fetchPage(1, "replace");
  }, [fetchPage]);

  const markItemRead = useCallback((id: ID) => {
    setItems((prev) =>
      prev.map((c) => (c.id === id && c.unreadCount > 0 ? { ...c, unreadCount: 0 } : c)),
    );
  }, []);

  return {
    items,
    total,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refetch,
    markItemRead,
  };
}
