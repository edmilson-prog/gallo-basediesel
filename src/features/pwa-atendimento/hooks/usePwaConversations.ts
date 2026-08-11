import { useCallback, useMemo, useState } from "react";
import type {
  ConversationChannel,
  ConversationStatus,
  ID,
  IConversation,
} from "@/shared/types";
import type { IListConversationsParams } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { useConversationsList } from "@/features/conversations/hooks/useConversationsList";
import { useRelatedEntities } from "@/features/conversations/hooks/useRelatedEntities";
import { useRealtimeConversations } from "@/features/conversations/hooks/useRealtimeConversations";
import { formatRelativeTime } from "@/features/conversations/utils/formatRelativeTime";
import { buildPwaPreview } from "../engine/messagePreview";
import { EMPTY_PWA_FILTERS, type IPwaFilters } from "../engine/pwaFilters";
import { initialsOf, shortNameOf } from "../components/ui/statusMeta";

/**
 * A conversation as the phone draws it.
 *
 * The domain keeps identity and last message OUTSIDE `IConversation` (contacts
 * are resolved by a gated RPC, previews come from the messages provider), so
 * something has to fuse the three sources. That fusion lives here, once, rather
 * than in every row component.
 */
export interface IPwaConversationVM {
  id: ID;
  name: string;
  short: string;
  initials: string;
  phone: string;
  channel: ConversationChannel;
  status: ConversationStatus;
  isMine: boolean;
  assignedSellerId: ID | null;
  unread: number;
  when: string;
  previewIcon: string | null;
  previewText: string;
  /** Epoch millis the conversation entered the pool queue; null when not queued. */
  queuedAtMs: number | null;
  conversation: IConversation;
}

export interface IUsePwaConversationsResult {
  items: IPwaConversationVM[];
  total: number;
  unreadConversations: number;
  queueCount: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMoreFailed: boolean;
  error: Error | null;
  loadMore: () => void;
  refetch: () => void;
  markItemRead: (id: ID) => void;
}

/** Filter state for the list screen, kept out of the data hook so the queue
 *  screen can pass fixed parameters without carrying unused UI state. */
export function usePwaFilterState() {
  const [filters, setFilters] = useState<IPwaFilters>(EMPTY_PWA_FILTERS);
  const resetFilters = useCallback(() => setFilters(EMPTY_PWA_FILTERS), []);
  return { filters, setFilters, resetFilters };
}

/** Store and seller identity used to build provider parameters. */
export function usePwaScope(): { storeId: ID | null; sellerId: ID | null } {
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();
  return { storeId: currentStoreId, sellerId: currentUser?.sellerId ?? null };
}

export function usePwaConversations(params: IListConversationsParams): IUsePwaConversationsResult {
  const { sellerId } = usePwaScope();
  const realtime = useRealtimeConversations();

  const list = useConversationsList(params, { refreshKey: realtime.tick });
  const related = useRelatedEntities(list.items);

  const items = useMemo<IPwaConversationVM[]>(() => {
    const now = new Date();
    return list.items.map((conversation) => {
      const contact = related.contacts.get(conversation.id);
      const lastMessage = related.lastMessages.get(conversation.id) ?? null;
      const preview = buildPwaPreview(lastMessage);
      // A conversation whose contact has not resolved yet still has to render —
      // a blank row reads as data loss, a neutral placeholder does not.
      const name = contact?.name ?? "Contato";
      const queuedAt = conversation.queuedAt ? Date.parse(conversation.queuedAt) : Number.NaN;

      return {
        id: conversation.id,
        name,
        short: shortNameOf(name),
        initials: initialsOf(name),
        phone: contact?.phone ?? "",
        channel: conversation.channel,
        status: conversation.status,
        isMine: Boolean(sellerId) && conversation.assignedSellerId === sellerId,
        assignedSellerId: conversation.assignedSellerId ?? null,
        unread: conversation.unreadCount,
        when: formatRelativeTime(conversation.lastMessageAt, now),
        previewIcon: preview.icon,
        previewText: preview.text,
        queuedAtMs: Number.isNaN(queuedAt) ? null : queuedAt,
        conversation,
      };
    });
  }, [list.items, related, sellerId]);

  const unreadConversations = useMemo(
    () => items.reduce((sum, item) => sum + (item.unread > 0 ? 1 : 0), 0),
    [items],
  );
  const queueCount = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + (!item.assignedSellerId && item.status !== "resolvida" ? 1 : 0),
        0,
      ),
    [items],
  );

  return {
    items,
    total: list.total,
    unreadConversations,
    queueCount,
    isLoading: list.isLoading,
    isLoadingMore: list.isLoadingMore,
    hasMore: list.hasMore,
    loadMoreFailed: list.loadMoreFailed,
    error: list.error,
    loadMore: list.loadMore,
    refetch: list.refetch,
    markItemRead: list.markItemRead,
  };
}
