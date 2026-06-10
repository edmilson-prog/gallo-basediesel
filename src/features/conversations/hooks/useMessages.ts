import { useCallback, useEffect, useRef, useState } from "react";
import type { ID, IMessage, MessageStatus } from "@/shared/types";
import { useMessagesProvider } from "@/providers/data";

const PAGE_SIZE = 50;

export interface IUseMessagesResult {
  messages: IMessage[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
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
}

/** Monotonic delivery ranking — `failed` is terminal and always applies. */
const STATUS_RANK: Record<MessageStatus, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

/**
 * Load messages of a conversation in ascending chronological order, with
 * cursor-style "load older" pagination. The provider currently exposes
 * page-based pagination over a sorted ascending list, so we paginate
 * backwards by computing the desired page number from the total count.
 */
export function useMessages(conversationId: ID): IUseMessagesResult {
  const provider = useMessagesProvider();
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const loadedPagesRef = useRef<number>(0);
  // Render-time mirror of `messages` — lets event callbacks (Realtime) decide
  // append-vs-patch without a stale closure.
  const messagesMirrorRef = useRef<IMessage[]>([]);
  messagesMirrorRef.current = messages;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    loadedPagesRef.current = 0;

    provider
      .list({ conversationId, page: 1, pageSize: PAGE_SIZE, orderDir: "desc" })
      .then((result) => {
        if (cancelled) return;
        // Provider returned newest-first; flip to oldest-first for display.
        const ordered = [...result.data].reverse();
        setMessages(ordered);
        setTotal(result.total);
        loadedPagesRef.current = 1;
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, provider, tick]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore) return;
    const loaded = messages.length;
    if (loaded >= total) return;
    setIsLoadingMore(true);
    try {
      const nextPage = loadedPagesRef.current + 1;
      const result = await provider.list({
        conversationId,
        page: nextPage,
        pageSize: PAGE_SIZE,
        orderDir: "desc",
      });
      // Older messages are at the head; reverse the page and prepend.
      const older = [...result.data].reverse();
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const merged = [...older.filter((m) => !seen.has(m.id)), ...prev];
        return merged;
      });
      loadedPagesRef.current = nextPage;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoadingMore(false);
    }
  }, [conversationId, isLoadingMore, messages.length, provider, total]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const appendOptimistic = useCallback((message: IMessage) => {
    setMessages((prev) => [...prev, message]);
    return {
      commit: (real: IMessage) => {
        // Drop a Realtime copy that may have landed before the commit (the
        // INSERT event carries the real id while the optimistic row still has
        // the temp id) — then swap the optimistic row for the real one.
        setMessages((prev) =>
          prev
            .filter((m) => m.id !== real.id || m.id === message.id)
            .map((m) => (m.id === message.id ? real : m)),
        );
      },
      fail: () => {
        setMessages((prev) =>
          prev.map((m) => (m.id === message.id ? { ...m, status: "failed" as const } : m)),
        );
      },
      update: (patch: Partial<IMessage>) => {
        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, ...patch } : m)));
      },
    };
  }, []);

  const patchStatus = useCallback((messageId: ID, status: MessageStatus) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, status } : m)));
  }, []);

  const applyRealtimeRow = useCallback((incoming: IMessage) => {
    // Membership decided on the ref mirror (updaters run at render time, so a
    // local flag set inside one is not readable here). The updater still
    // dedupes defensively against a same-id race.
    const appended = !messagesMirrorRef.current.some((m) => m.id === incoming.id);
    setMessages((prev) => {
      const existing = prev.find((m) => m.id === incoming.id);
      if (existing) {
        const keepStatus = STATUS_RANK[existing.status] > STATUS_RANK[incoming.status];
        return prev.map((m) =>
          m.id === incoming.id
            ? { ...m, ...incoming, status: keepStatus ? m.status : incoming.status }
            : m,
        );
      }
      return [...prev, incoming];
    });
    // Keep hasMore (length < total) honest when a live row lands; a rare
    // extra +1 only delays hasMore turning false (loadMore dedupes by id).
    if (appended) setTotal((t) => t + 1);
  }, []);

  const retry = useCallback(
    async (message: IMessage) => {
      patchStatus(message.id, "sent");
      try {
        await provider.markStatus(message.id, "delivered");
        patchStatus(message.id, "delivered");
        // Best-effort: most retries land as delivered; the consumer can
        // chain further status updates if it wants the same dance as a
        // brand-new send.
      } catch (err) {
        patchStatus(message.id, "failed");
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [patchStatus, provider],
  );

  return {
    messages,
    isLoading,
    isLoadingMore,
    hasMore: messages.length < total,
    error,
    loadMore,
    refresh,
    appendOptimistic,
    retry,
    patchStatus,
    applyRealtimeRow,
  };
}
