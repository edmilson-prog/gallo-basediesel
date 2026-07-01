import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ID, IConversation } from "@/shared/types";
import { useConversationsProvider, type IListConversationsParams } from "@/providers/data";

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
 * sync with simulated inbound traffic). On filter change, both pagination
 * state and the items array reset.
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

  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  const refreshKey = options.refreshKey ?? 0;
  const mode = options.mode ?? "list";
  const pageRef = useRef(page);
  pageRef.current = page;

  const fetchPage = useCallback(
    async (pageToLoad: number, fetchMode: "replace" | "append") => {
      if (fetchMode === "replace") setIsLoading(true);
      else setIsLoadingMore(true);
      try {
        const fetcher = mode === "messages" ? provider.searchMessages : provider.list;
        const result = await fetcher({
          ...filters,
          page: pageToLoad,
          pageSize: PAGE_SIZE,
        });
        setError(null);
        setTotal(result.total);
        if (fetchMode === "replace") {
          setItems(result.data);
        } else {
          setItems((prev) => {
            const seen = new Set(prev.map((c) => c.id));
            return [...prev, ...result.data.filter((c) => !seen.has(c.id))];
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (fetchMode === "replace") setIsLoading(false);
        else setIsLoadingMore(false);
      }
    },
    // We intentionally key on the JSON snapshot to avoid noisy re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [provider, filtersKey, mode],
  );

  // Reset to page 1 whenever filters change OR the fetch mode flips
  // (list ↔ messages — see Opção D's "search inside messages" toggle).
  useEffect(() => {
    setPage(1);
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

  const loadMore = useCallback(() => {
    if (isLoading || isLoadingMore) return;
    if (items.length >= total) return;
    const nextPage = page + 1;
    setPage(nextPage);
    void fetchPage(nextPage, "append");
  }, [isLoading, isLoadingMore, items.length, total, page, fetchPage]);

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
    hasMore: items.length < total,
    error,
    loadMore,
    refetch,
    markItemRead,
  };
}
