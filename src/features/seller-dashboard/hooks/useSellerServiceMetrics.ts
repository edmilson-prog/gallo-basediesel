import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  IConversation,
  ICustomerServiceMetrics,
  ID,
  IMessage,
  IOrder,
  ISdrEscalation,
} from "@/shared/types";
import {
  useConversationsProvider,
  useMessagesProvider,
  useOrdersProvider,
  useSdrEscalationsProvider,
  useSellersProvider,
} from "@/providers/data";
import { calculateCustomerServiceMetrics } from "@/features/customer-service-analytics";
import type { ISellerPeriodWindow } from "../engine/period";

const STALE_MS = 30_000;
const PAGE_SIZE = 1000;

export interface IUseSellerServiceMetricsParams {
  storeId: ID;
  sellerId: ID;
  window: ISellerPeriodWindow;
}

export interface IUseSellerServiceMetricsResult {
  isLoading: boolean;
  isError: boolean;
  metrics: ICustomerServiceMetrics | null;
  /** Conversations created inside the current window — used for hourly bucketing. */
  conversationsCurrent: IConversation[];
  salesCurrent: number;
  salesPrevious: number;
}

/**
 * Personal analogue of `useCustomerServiceMetrics` (PRD-051), scoped to one
 * seller's own conversations/orders instead of the whole store.
 */
export function useSellerServiceMetrics(
  params: IUseSellerServiceMetricsParams,
): IUseSellerServiceMetricsResult {
  const { storeId, sellerId, window } = params;

  const conversationsProvider = useConversationsProvider();
  const messagesProvider = useMessagesProvider();
  const ordersProvider = useOrdersProvider();
  const sdrEscalationsProvider = useSdrEscalationsProvider();
  const sellersProvider = useSellersProvider();

  const conversationsQuery = useQuery({
    queryKey: [
      "seller-dashboard",
      "conversations",
      storeId,
      sellerId,
      window.previousStartIso,
      window.endIso,
    ],
    queryFn: () =>
      conversationsProvider.list({
        storeId,
        assignedSellerId: sellerId,
        fromDate: window.previousStartIso,
        toDate: window.endIso,
        pageSize: PAGE_SIZE,
      }),
    staleTime: STALE_MS,
  });

  const ordersQuery = useQuery({
    queryKey: ["seller-dashboard", "orders", storeId, sellerId, window.previousStartIso, window.endIso],
    queryFn: () =>
      ordersProvider.list({
        storeId,
        sellerId,
        since: window.previousStartIso,
        until: window.endIso,
        pageSize: PAGE_SIZE,
      }),
    staleTime: STALE_MS,
  });

  const escalationsQuery = useQuery({
    queryKey: ["seller-dashboard", "escalations", storeId, window.startIso, window.endIso],
    queryFn: () =>
      sdrEscalationsProvider.list({ storeId, fromDate: window.startIso, toDate: window.endIso }),
    staleTime: STALE_MS,
  });

  const sellersQuery = useQuery({
    queryKey: ["seller-dashboard", "sellers", storeId],
    queryFn: () => sellersProvider.list({ storeId, active: true }),
    staleTime: STALE_MS,
  });

  const conversationsAll = useMemo<IConversation[]>(
    () => conversationsQuery.data?.data ?? [],
    [conversationsQuery.data],
  );

  const conversationsCurrent = useMemo<IConversation[]>(
    () =>
      conversationsAll.filter((c) => c.createdAt >= window.startIso && c.createdAt <= window.endIso),
    [conversationsAll, window.startIso, window.endIso],
  );

  const conversationsPrevious = useMemo<IConversation[]>(
    () =>
      conversationsAll.filter(
        (c) => c.createdAt >= window.previousStartIso && c.createdAt <= window.previousEndIso,
      ),
    [conversationsAll, window.previousStartIso, window.previousEndIso],
  );

  const messagesQuery = useQuery({
    queryKey: [
      "seller-dashboard",
      "messages",
      sellerId,
      window.startIso,
      window.endIso,
      conversationsCurrent.map((c) => c.id).join(","),
    ],
    queryFn: () =>
      messagesProvider.listForAnalytics({
        conversationIds: conversationsCurrent.map((c) => c.id),
        since: window.startIso,
        until: window.endIso,
      }),
    staleTime: STALE_MS,
    enabled: conversationsCurrent.length > 0,
  });

  const paidOrdersAll = useMemo<IOrder[]>(
    () => (ordersQuery.data?.data ?? []).filter((o) => o.paymentStatus === "pago"),
    [ordersQuery.data],
  );

  const salesCurrent = useMemo(
    () =>
      paidOrdersAll
        .filter((o) => o.createdAt >= window.startIso && o.createdAt <= window.endIso)
        .reduce((sum, o) => sum + o.total, 0),
    [paidOrdersAll, window.startIso, window.endIso],
  );

  const salesPrevious = useMemo(
    () =>
      paidOrdersAll
        .filter((o) => o.createdAt >= window.previousStartIso && o.createdAt <= window.previousEndIso)
        .reduce((sum, o) => sum + o.total, 0),
    [paidOrdersAll, window.previousStartIso, window.previousEndIso],
  );

  const metrics = useMemo<ICustomerServiceMetrics | null>(() => {
    if (!conversationsQuery.data || !ordersQuery.data || !sellersQuery.data) return null;
    const escalations: ISdrEscalation[] = escalationsQuery.data ?? [];
    const messages: IMessage[] = messagesQuery.data ?? [];
    return calculateCustomerServiceMetrics({
      conversations: conversationsCurrent,
      conversationsPrevious,
      messages,
      paidOrders: paidOrdersAll,
      escalations,
      sellers: sellersQuery.data,
      period: { start: window.startIso, end: window.endIso },
    });
  }, [
    conversationsCurrent,
    conversationsPrevious,
    conversationsQuery.data,
    ordersQuery.data,
    paidOrdersAll,
    escalationsQuery.data,
    messagesQuery.data,
    sellersQuery.data,
    window.startIso,
    window.endIso,
  ]);

  return {
    isLoading: conversationsQuery.isLoading || ordersQuery.isLoading || sellersQuery.isLoading,
    isError:
      conversationsQuery.isError ||
      ordersQuery.isError ||
      sellersQuery.isError ||
      escalationsQuery.isError,
    metrics,
    conversationsCurrent,
    salesCurrent,
    salesPrevious,
  };
}
