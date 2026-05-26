import type {
  ConversationChannel,
  IConversation,
  ICustomer,
  IMessage,
  ISeller,
  ID,
  ISO8601,
} from "@/shared/types";
import { selectAllConversations, selectAllCustomers, selectAllSellers } from "../store/selectors";
import { getMockState } from "../store/mockStore";
import { runApi } from "./utils";

const OPEN_STATUSES = new Set<IConversation["status"]>([
  "aguardando",
  "em_andamento",
  "aguardando_cliente",
]);

export interface IManagerDashboardSnapshotParams {
  storeId?: ID;
  sellerId?: ID;
  channel?: ConversationChannel;
  fromIso: ISO8601;
  toIso: ISO8601;
  prevFromIso: ISO8601;
  prevToIso: ISO8601;
}

export interface IManagerDashboardSnapshot {
  openConversations: IConversation[];
  sellers: ISeller[];
  customers: ICustomer[];
  conversationsInPeriod: IConversation[];
  messagesInPeriod: IMessage[];
  conversationsInPrev: IConversation[];
  messagesInPrev: IMessage[];
}

function matchesScope(conv: IConversation, params: IManagerDashboardSnapshotParams): boolean {
  if (params.storeId && conv.storeId !== params.storeId) return false;
  if (params.sellerId && conv.assignedSellerId !== params.sellerId) return false;
  if (params.channel && conv.channel !== params.channel) return false;
  return true;
}

function inWindow(iso: ISO8601, fromIso: ISO8601, toIso: ISO8601): boolean {
  return iso >= fromIso && iso <= toIso;
}

export const managerDashboardApi = {
  snapshot(params: IManagerDashboardSnapshotParams): Promise<IManagerDashboardSnapshot> {
    return runApi(
      "managerDashboardApi",
      "snapshot",
      () => {
        const conversations = selectAllConversations();
        const allSellers = selectAllSellers();
        const allCustomers = selectAllCustomers();

        const sellers = params.storeId
          ? allSellers.filter((s) => s.storeId === params.storeId)
          : allSellers;
        const customers = params.storeId
          ? allCustomers.filter((c) => c.storeId === params.storeId)
          : allCustomers;

        const scoped = conversations.filter((c) => matchesScope(c, params));
        const conversationIdSet = new Set(scoped.map((c) => c.id));

        // Open conversations — current state, ignores window.
        const openConversations = scoped.filter((c) => OPEN_STATUSES.has(c.status));

        // Period buckets — conversation was active when its lastMessageAt fell in window
        // (cheap and good enough proxy for "abertas/resolvidas no período" on Fase 1).
        const conversationsInPeriod = scoped.filter((c) =>
          inWindow(c.lastMessageAt, params.fromIso, params.toIso),
        );
        const conversationsInPrev = scoped.filter((c) =>
          inWindow(c.lastMessageAt, params.prevFromIso, params.prevToIso),
        );

        // Messages — join through conversationId so the scope filters propagate.
        const allMessages = getMockState().messages;
        const messagesInPeriod = allMessages.filter(
          (m) =>
            conversationIdSet.has(m.conversationId) &&
            inWindow(m.sentAt, params.fromIso, params.toIso),
        );
        const messagesInPrev = allMessages.filter(
          (m) =>
            conversationIdSet.has(m.conversationId) &&
            inWindow(m.sentAt, params.prevFromIso, params.prevToIso),
        );

        return {
          openConversations,
          sellers,
          customers,
          conversationsInPeriod,
          messagesInPeriod,
          conversationsInPrev,
          messagesInPrev,
        };
      },
      { payload: params },
    );
  },
};
