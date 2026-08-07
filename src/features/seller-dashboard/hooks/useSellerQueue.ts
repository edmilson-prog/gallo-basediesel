import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IConversation, IConversationContact } from "@/shared/types";
import { useConversationsProvider } from "@/providers/data";

const STALE_MS = 15_000;
const MAX_ENTRIES = 5;
const PAGE_SIZE = 200;

/** Statuses that mean "this conversation is still on the seller's plate". */
const OPEN_STATUSES: IConversation["status"][] = [
  "aguardando",
  "em_andamento",
  "aguardando_cliente",
];

export interface ISellerQueueEntry {
  conversationId: ID;
  contactName: string;
  waitingSince: string;
}

export interface IUseSellerQueueResult {
  isLoading: boolean;
  hasError: boolean;
  entries: ISellerQueueEntry[];
  total: number;
}

/**
 * The seller's own open conversations, oldest-waiting first.
 *
 * Deliberately NOT `getIdleSummary()`: that is the idle-ALERT feed, which is
 * gated behind the per-store `idleAlerts.enabled` toggle (off by default, and
 * still off in production) and only surfaces threads already past the level-1
 * idle threshold. Wired to it, this card asserted "Nenhuma conversa aguardando
 * sua resposta agora" to sellers sitting on a real backlog.
 */
export function useSellerQueue(storeId: ID, sellerId: ID): IUseSellerQueueResult {
  const conversationsProvider = useConversationsProvider();
  const enabled = Boolean(storeId) && Boolean(sellerId);

  const conversationsQuery = useQuery({
    // Keyed by identity: the QueryClient is created once at boot and never
    // cleared on auth change, so an identity-free key would serve the previous
    // seller's queue to the next one signing in on the same tab.
    queryKey: ["seller-dashboard", "queue", storeId, sellerId],
    queryFn: () =>
      conversationsProvider.list({
        storeId,
        assignedSellerId: sellerId,
        status: OPEN_STATUSES,
        orderBy: "lastMessageAt",
        orderDir: "asc",
        pageSize: PAGE_SIZE,
        withTotal: false,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const conversations = useMemo<IConversation[]>(
    () => conversationsQuery.data?.data ?? [],
    [conversationsQuery.data],
  );

  const visible = useMemo(() => conversations.slice(0, MAX_ENTRIES), [conversations]);

  const contactsQuery = useQuery({
    queryKey: [
      "seller-dashboard",
      "queue-contacts",
      storeId,
      sellerId,
      visible.map((c) => c.id).join(","),
    ],
    queryFn: () => conversationsProvider.listContacts(visible.map((c) => c.id)),
    staleTime: STALE_MS,
    enabled: enabled && visible.length > 0,
  });

  const entries = useMemo<ISellerQueueEntry[]>(() => {
    const byId = new Map<ID, IConversationContact>();
    for (const contact of contactsQuery.data ?? []) byId.set(contact.conversationId, contact);
    return visible.map((conversation) => ({
      conversationId: conversation.id,
      contactName: byId.get(conversation.id)?.name ?? "Contato sem nome",
      waitingSince: conversation.lastMessageAt,
    }));
  }, [visible, contactsQuery.data]);

  return {
    isLoading: conversationsQuery.isLoading,
    hasError: conversationsQuery.isError,
    entries,
    total: conversations.length,
  };
}
