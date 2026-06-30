import { useCallback, useMemo } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import type { ID, IMessage, MessageStatus } from "@/shared/types";
import { useMessagesProvider, type IPaginatedResult } from "@/providers/data";
import { statusAdvances } from "@/providers/whatsapp/messageStatus";

const PAGE_SIZE = 50;

type MessagePage = IPaginatedResult<IMessage>;
type MessagesCache = InfiniteData<MessagePage, number>;

/** Stable empty reference so the derived list keeps identity when there's no data. */
const EMPTY_MESSAGES: IMessage[] = [];

/** Query key for a conversation's message history. */
function messagesKey(conversationId: ID): readonly [string, ID] {
  return ["messages", conversationId];
}

/**
 * Reverse a newest-first provider page to oldest-first.
 *
 * `syncLatest` feeds each row to `applyRealtimeRow`, whose new-row path inserts
 * by `sentAt` ({@link insertSortedDesc}). Feeding oldest-first keeps the cheap
 * common case (each newer row appends at the head) while a row recovered out of
 * order still lands correctly. Returns a fresh array (never mutates the input).
 */
export function toAscending(descRows: IMessage[]): IMessage[] {
  return [...descRows].reverse();
}

/**
 * Insert `message` into a newest-first (desc by `sentAt`) page, returning a
 * fresh array, at the slot that keeps the page sorted: the newest row lands at
 * the head (index 0), a row recovered out of arrival order lands in its real
 * chronological slot. Pure — drives `insertByRecency` and is unit-tested.
 */
export function insertSortedDesc(descRows: IMessage[], message: IMessage): IMessage[] {
  const data = [...descRows];
  let idx = data.findIndex((m) => m.sentAt < message.sentAt);
  if (idx === -1) idx = data.length;
  data.splice(idx, 0, message);
  return data;
}

export interface IUseMessagesResult {
  messages: IMessage[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  /**
   * True while a previous conversation's cache is shown during a switch
   * (`keepPreviousData`) — the new conversation hasn't loaded yet. Lets the
   * list dim itself instead of presenting stale content as if it were current.
   */
  isPlaceholder: boolean;
  error: Error | null;
  loadMore: () => Promise<void>;
  refresh: () => void;
  /**
   * Optimistically append a message to the local cache before the provider
   * resolves. Returns a `commit` function the caller invokes when the real
   * provider response is available, replacing the optimistic row by id.
   */
  appendOptimistic: (message: IMessage) => {
    commit: (real: IMessage) => void;
    fail: () => void;
    update: (patch: Partial<IMessage>) => void;
  };
  /** Re-send a failed message via the provider, updating the local cache. */
  retry: (message: IMessage) => Promise<void>;
  /** Patch the status of a local message by id (used by send simulation). */
  patchStatus: (messageId: ID, status: MessageStatus) => void;
  /**
   * Upsert a row coming from Supabase Realtime (PRD-118): INSERTs append,
   * UPDATEs patch in place. Status never regresses (e.g. a late `queued`
   * INSERT event cannot downgrade an already `sent` bubble).
   */
  applyRealtimeRow: (incoming: IMessage) => void;
  /**
   * Live catch-up fallback: refetch the latest page and merge each row through
   * `applyRealtimeRow`. Used when the `messages` Realtime channel misses an
   * INSERT but the `conversations` channel delivers the touch (see
   * {@link useRealtimeMessages}). Optimistic-safe — only ADDS missing rows and
   * patches statuses forward, so an in-flight optimistic bubble is never
   * dropped (unlike a full `refetch`).
   */
  syncLatest: () => Promise<void>;
}

/**
 * Load messages of a conversation in ascending chronological order, with
 * cursor-style "load older" pagination, backed by a TanStack `useInfiniteQuery`.
 *
 * Caching per conversation (PRD-011) is what keeps switching between threads
 * fluid: a revisited conversation paints instantly from cache (and revalidates
 * in the background), and a never-seen one keeps the previous thread visible —
 * dimmed via `isPlaceholder` — instead of flashing a spinner. The provider
 * returns newest-first pages; we flip to oldest-first for display.
 *
 * Optimistic sends, Realtime upserts and status patches mutate the query cache
 * directly through `setQueryData`, so the bubble lifecycle is unchanged from the
 * previous local-state implementation while gaining the cache.
 */
export function useMessages(conversationId: ID): IUseMessagesResult {
  const provider = useMessagesProvider();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: messagesKey(conversationId),
    queryFn: ({ pageParam }) =>
      provider.list({
        conversationId,
        page: pageParam,
        pageSize: PAGE_SIZE,
        orderDir: "desc",
      }),
    initialPageParam: 1,
    // No reliance on the (now estimated) server count: a full page implies
    // there may be older messages; a short page means we reached the start.
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.data.length === PAGE_SIZE ? lastPageParam + 1 : undefined,
    // Keep the prior conversation visible (the list dims it) instead of a
    // spinner-flash while a never-seen conversation loads; revisited ones come
    // straight from cache.
    placeholderData: keepPreviousData,
    // Realtime only patches the OPEN conversation's cache, so a conversation
    // left and re-entered must revalidate to catch messages that arrived while
    // away — keep it always-stale. keepPreviousData + the cached pages keep the
    // revisit instant; the refetch runs invisibly in the background.
    staleTime: 0,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Pages are newest-first (desc); flatten to oldest-first for display by
  // walking pages oldest→newest, each page reversed.
  const messages = useMemo<IMessage[]>(() => {
    const pages = query.data?.pages;
    if (!pages || pages.length === 0) return EMPTY_MESSAGES;
    const out: IMessage[] = [];
    for (let i = pages.length - 1; i >= 0; i -= 1) {
      const data = pages[i]?.data ?? [];
      for (let j = data.length - 1; j >= 0; j -= 1) {
        const m = data[j];
        if (m) out.push(m);
      }
    }
    return out;
  }, [query.data]);

  // --- Local cache mutations (optimistic send, Realtime, status patches) ---
  // All operate on the infinite-query cache via setQueryData so a re-render
  // reflects them immediately; only a background refetch can supersede a
  // not-yet-persisted optimistic row.

  /** Map every page's data through `recipe` (structure-preserving patches). */
  const mapPages = useCallback(
    (recipe: (data: IMessage[]) => IMessage[]) => {
      queryClient.setQueryData<MessagesCache>(messagesKey(conversationId), (old) => {
        if (!old) return old;
        return { ...old, pages: old.pages.map((p) => ({ ...p, data: recipe(p.data) })) };
      });
    },
    [queryClient, conversationId],
  );

  const patchById = useCallback(
    (id: ID, patch: Partial<IMessage>) => {
      mapPages((data) =>
        data.some((m) => m.id === id) ? data.map((m) => (m.id === id ? { ...m, ...patch } : m)) : data,
      );
    },
    [mapPages],
  );

  /** Prepend a new row to the newest page (index 0 of a desc page). */
  const prependNewest = useCallback(
    (message: IMessage) => {
      queryClient.setQueryData<MessagesCache>(messagesKey(conversationId), (old) => {
        const seededPage: MessagePage = { data: [message], total: 1, page: 1, pageSize: PAGE_SIZE };
        if (!old) return { pages: [seededPage], pageParams: [1] };
        const [first, ...rest] = old.pages;
        const merged: MessagePage = first ? { ...first, data: [message, ...first.data] } : seededPage;
        return { ...old, pages: [merged, ...rest] };
      });
    },
    [queryClient, conversationId],
  );

  /**
   * Insert a not-yet-cached row into the newest (desc) page at the slot that
   * keeps it sorted by `sentAt` desc. For a normal live row (the newest) this is
   * the head — identical to {@link prependNewest}; for a catch-up row recovered
   * out of arrival order (older than the current head, e.g. the messages channel
   * delivered a newer row but dropped this one) it lands in its real
   * chronological slot instead of being forced to the top.
   */
  const insertByRecency = useCallback(
    (message: IMessage) => {
      queryClient.setQueryData<MessagesCache>(messagesKey(conversationId), (old) => {
        const seededPage: MessagePage = { data: [message], total: 1, page: 1, pageSize: PAGE_SIZE };
        if (!old) return { pages: [seededPage], pageParams: [1] };
        const [first, ...rest] = old.pages;
        if (!first) return { ...old, pages: [seededPage, ...rest] };
        return { ...old, pages: [{ ...first, data: insertSortedDesc(first.data, message) }, ...rest] };
      });
    },
    [queryClient, conversationId],
  );

  const appendOptimistic = useCallback(
    (message: IMessage) => {
      prependNewest(message);
      return {
        commit: (real: IMessage) => {
          // Drop a Realtime copy that may have landed before the commit (its
          // INSERT carries the real id while the optimistic row still has the
          // temp id), then swap the optimistic row for the real one.
          mapPages((data) =>
            data
              .filter((m) => m.id !== real.id || m.id === message.id)
              .map((m) => (m.id === message.id ? real : m)),
          );
        },
        fail: () => patchById(message.id, { status: "failed" }),
        update: (patch: Partial<IMessage>) => patchById(message.id, patch),
      };
    },
    [prependNewest, mapPages, patchById],
  );

  const patchStatus = useCallback(
    (messageId: ID, status: MessageStatus) => patchById(messageId, { status }),
    [patchById],
  );

  const applyRealtimeRow = useCallback(
    (incoming: IMessage) => {
      // Read-then-write is safe here: this runs synchronously from the Realtime
      // callback, so no concurrent mutation lands between the lookup and write.
      const cache = queryClient.getQueryData<MessagesCache>(messagesKey(conversationId));
      const exists = cache?.pages.some((p) => p.data.some((m) => m.id === incoming.id)) ?? false;
      if (!exists) {
        // New row → insert in its chronological slot. For a live INSERT (the
        // newest) this is the head; for a catch-up row recovered out of order by
        // syncLatest it lands correctly instead of jumping above newer rows.
        insertByRecency(incoming);
        return;
      }
      // Existing row (status transition). Status never regresses; `failed` is
      // recoverable (a transient ERROR ack can be superseded by a later
      // delivered/read) — see statusAdvances.
      mapPages((data) =>
        data.map((m) => {
          if (m.id !== incoming.id) return m;
          const advances = statusAdvances(m.status, incoming.status);
          return { ...m, ...incoming, status: advances ? incoming.status : m.status };
        }),
      );
    },
    [queryClient, conversationId, insertByRecency, mapPages],
  );

  const syncLatest = useCallback(async () => {
    try {
      const result = await provider.list({
        conversationId,
        page: 1,
        pageSize: PAGE_SIZE,
        orderDir: "desc",
      });
      // Oldest-first; applyRealtimeRow inserts each missing row by sentAt, so a
      // row recovered out of arrival order still lands in chronological position.
      for (const row of toAscending(result.data)) applyRealtimeRow(row);
    } catch {
      // Best-effort live catch-up: a failed sync leaves the thread as-is —
      // re-entering the conversation forces a full refetch (staleTime: 0).
    }
  }, [provider, conversationId, applyRealtimeRow]);

  const { fetchNextPage, refetch, hasNextPage, isFetchingNextPage } = query;

  const loadMore = useCallback(async () => {
    if (!hasNextPage || isFetchingNextPage) return;
    await fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const retry = useCallback(
    async (message: IMessage) => {
      patchStatus(message.id, "sent");
      try {
        await provider.markStatus(message.id, "delivered");
        patchStatus(message.id, "delivered");
        // Best-effort: most retries land as delivered; the consumer can chain
        // further status updates if it wants the full new-send dance.
      } catch {
        patchStatus(message.id, "failed");
      }
    },
    [patchStatus, provider],
  );

  return {
    messages,
    isLoading: query.isLoading,
    isLoadingMore: isFetchingNextPage,
    hasMore: hasNextPage,
    isPlaceholder: query.isPlaceholderData,
    error: query.error,
    loadMore,
    refresh,
    appendOptimistic,
    retry,
    patchStatus,
    applyRealtimeRow,
    syncLatest,
  };
}
