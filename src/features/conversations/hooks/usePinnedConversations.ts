import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IConversation } from "@/shared/types";
import {
  useConversationPinsProvider,
  useConversationsProvider,
  type IConversationPin,
} from "@/providers/data";
import { MAX_PINNED } from "../config/pinDefaults";
import { canPinMore } from "../engine/pinPolicy";
import { markConversationReadInList } from "../engine/markRead";
import { useInboxPinsLimit } from "./useInboxPinsLimit";
import { INBOX_STRINGS } from "../i18n/pt-BR";

/** Same window the list uses to collapse a burst of realtime ticks. */
const REALTIME_REFETCH_DEBOUNCE_MS = 300;

export interface IUsePinnedConversationsParams {
  /** Seller owning the pins. Without it (profile with no seller) the feature stays inert. */
  sellerId: ID | null;
  /** The Inbox's realtime tick — keeps the pinned previews fresh. */
  refreshKey?: number;
}

export interface IPinnedConversationsState {
  /** Pinned conversations, most recent traffic first. */
  pinnedItems: IConversation[];
  pinnedIds: Set<ID>;
  isPinned: (id: ID) => boolean;
  /** Pins when unpinned, unpins when pinned. Handles the cap internally. */
  togglePin: (conversation: IConversation) => Promise<void>;
  /**
   * Clears the unread badge of a pinned row locally, mirroring the list's own
   * `markItemRead`. The Inbox reads the open conversation from EITHER source,
   * so both have to be zeroed — otherwise the read-reset effect keeps seeing
   * `unreadCount > 0` here and re-fires on every list change.
   */
  markPinnedRead: (id: ID) => void;
  /** False once the cap is reached — disables the pin affordance. */
  canPin: boolean;
  maxPinned: number;
  pinnedCount: number;
}

/**
 * The logged-in attendant's pinned conversations (spec 2026-08-11).
 *
 * Two chained fetches: the pins (ids) and, with them, the conversations by id.
 * That second fetch is what makes a pin survive filters and pagination — the
 * pinned conversation comes back even when it sits outside the loaded window.
 *
 * Touches NOTHING of the frozen Attendance cache: its own query keys, no new
 * realtime subscription (it consumes the tick the Inbox already receives) and no
 * relation whatsoever to the media pipeline.
 */
export function usePinnedConversations({
  sellerId,
  refreshKey = 0,
}: IUsePinnedConversationsParams): IPinnedConversationsState {
  const pinsProvider = useConversationPinsProvider();
  const conversationsProvider = useConversationsProvider();
  const queryClient = useQueryClient();
  const maxPinned = useInboxPinsLimit();

  const pinsKey = useMemo(() => ["conversation-pins", sellerId] as const, [sellerId]);

  const pinsQuery = useQuery({
    queryKey: pinsKey,
    queryFn: () => pinsProvider.list(sellerId as ID),
    enabled: sellerId !== null,
  });

  const pins = useMemo(() => pinsQuery.data ?? [], [pinsQuery.data]);
  const ids = useMemo(() => pins.map((p) => p.conversationId), [pins]);
  // Stable key for the id set: without it the query would refetch on every
  // render (a fresh array is never referentially equal to the previous one).
  const idsKey = useMemo(() => [...ids].sort().join(","), [ids]);

  const conversationsQuery = useQuery({
    queryKey: ["pinned-conversations", sellerId, idsKey] as const,
    queryFn: () =>
      conversationsProvider
        .list({ ids, withTotal: false, page: 1, pageSize: MAX_PINNED })
        .then((res) => res.data),
    enabled: sellerId !== null && ids.length > 0,
  });

  const pinnedItems = useMemo(() => {
    const rows = conversationsQuery.data ?? [];
    // Same recency reading as the list — whoever looks at the block expects the
    // conversation with the newest traffic on top, not the one pinned last.
    return [...rows].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  }, [conversationsQuery.data]);

  const pinnedIds = useMemo(() => new Set(ids), [ids]);
  const isPinned = useCallback((id: ID) => pinnedIds.has(id), [pinnedIds]);

  // Local-only badge reset for a pinned row. Writes straight into this query's
  // cache with the same referential bailout the list uses, so a no-op write
  // cannot re-render (and therefore cannot re-trigger the caller's effect).
  // Persistence is the caller's `conversationsProvider.markRead` — this only
  // keeps the pinned copy in step with the list copy.
  const conversationsKey = useMemo(
    () => ["pinned-conversations", sellerId, idsKey] as const,
    [sellerId, idsKey],
  );
  const markPinnedRead = useCallback(
    (id: ID) => {
      queryClient.setQueryData<IConversation[]>(conversationsKey, (prev) =>
        prev ? markConversationReadInList(prev, id) : prev,
      );
    },
    [queryClient, conversationsKey],
  );

  // The Inbox's realtime tick also refreshes the pinned previews. Same debounce
  // as the list, so a burst becomes a single refetch.
  const refetchPinnedConversations = conversationsQuery.refetch;
  useEffect(() => {
    if (refreshKey === 0) return;
    const handle = window.setTimeout(() => {
      void refetchPinnedConversations();
    }, REALTIME_REFETCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const togglePin = useCallback(
    async (conversation: IConversation) => {
      if (!sellerId) return;
      const currentlyPinned = pinnedIds.has(conversation.id);
      if (!currentlyPinned && !canPinMore(pins.length, maxPinned)) {
        toast.info(INBOX_STRINGS.pin.limitReached(maxPinned));
        return;
      }
      const previous = queryClient.getQueryData<IConversationPin[]>(pinsKey) ?? pins;
      const optimistic: IConversationPin[] = currentlyPinned
        ? previous.filter((p) => p.conversationId !== conversation.id)
        : [
            {
              conversationId: conversation.id,
              sellerId,
              storeId: conversation.storeId,
              createdAt: new Date().toISOString(),
            },
            ...previous,
          ];
      queryClient.setQueryData(pinsKey, optimistic);
      try {
        if (currentlyPinned) {
          await pinsProvider.unpin(conversation.id, sellerId);
        } else {
          await pinsProvider.pin({
            conversationId: conversation.id,
            sellerId,
            storeId: conversation.storeId,
          });
        }
        await queryClient.invalidateQueries({ queryKey: pinsKey });
      } catch {
        queryClient.setQueryData(pinsKey, previous);
        toast.error(INBOX_STRINGS.actionFailed);
      }
    },
    [sellerId, pinnedIds, pins, maxPinned, queryClient, pinsKey, pinsProvider],
  );

  return {
    pinnedItems,
    pinnedIds,
    isPinned,
    togglePin,
    markPinnedRead,
    canPin: sellerId !== null && canPinMore(pins.length, maxPinned),
    maxPinned,
    pinnedCount: pins.length,
  };
}
