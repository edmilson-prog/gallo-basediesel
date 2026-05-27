import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  IConversation,
  ICustomerServiceMetrics,
  ID,
  IMessage,
  IOrder,
  ISdrEscalation,
  ISeller,
} from "@/shared/types";
import {
  useConversationsProvider,
  useMessagesProvider,
  useOrdersProvider,
  useSdrEscalationsProvider,
  useSellersProvider,
} from "@/providers/data";
import { calculateCustomerServiceMetrics } from "../engine";

export interface ICustomerServiceFilters {
  storeId: ID;
  monthKey: string;
  sellerId?: ID | "all";
}

export interface IUseCustomerServiceMetricsResult {
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  metrics: ICustomerServiceMetrics | null;
  /** Sellers active in the store — used by the filter dropdown. */
  sellers: ISeller[];
}

const STALE_MS = 60_000;
const PAGE_SIZE = 1000;

function monthBounds(monthKey: string): { start: string; end: string } {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) {
    const now = new Date();
    return monthBounds(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString();
  return { start, end };
}

function previousMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function trendWindow(monthKey: string): { start: string; end: string } {
  const [y, m] = monthKey.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 12, 1)).toISOString();
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)).toISOString();
  return { start, end };
}

export function useCustomerServiceMetrics(
  filters: ICustomerServiceFilters,
): IUseCustomerServiceMetricsResult {
  const conversationsProvider = useConversationsProvider();
  const messagesProvider = useMessagesProvider();
  const ordersProvider = useOrdersProvider();
  const sdrEscalationsProvider = useSdrEscalationsProvider();
  const sellersProvider = useSellersProvider();

  const period = useMemo(() => monthBounds(filters.monthKey), [filters.monthKey]);
  const prev = useMemo(() => monthBounds(previousMonth(filters.monthKey)), [filters.monthKey]);
  const trend = useMemo(() => trendWindow(filters.monthKey), [filters.monthKey]);

  const conversationsQuery = useQuery({
    queryKey: ["csa", "conversations", filters.storeId, trend.start, trend.end],
    queryFn: () =>
      conversationsProvider.list({
        storeId: filters.storeId,
        fromDate: trend.start,
        toDate: trend.end,
        pageSize: PAGE_SIZE,
      }),
    staleTime: STALE_MS,
  });

  const ordersQuery = useQuery({
    queryKey: ["csa", "orders", filters.storeId, trend.start, trend.end],
    queryFn: () =>
      ordersProvider.list({
        storeId: filters.storeId,
        since: trend.start,
        until: trend.end,
        pageSize: PAGE_SIZE,
      }),
    staleTime: STALE_MS,
  });

  const escalationsQuery = useQuery({
    queryKey: ["csa", "escalations", filters.storeId, period.start, period.end],
    queryFn: () =>
      sdrEscalationsProvider.list({
        storeId: filters.storeId,
        fromDate: period.start,
        toDate: period.end,
      }),
    staleTime: STALE_MS,
  });

  const sellersQuery = useQuery({
    queryKey: ["csa", "sellers", filters.storeId],
    queryFn: () => sellersProvider.list({ storeId: filters.storeId, active: true }),
    staleTime: STALE_MS,
  });

  const conversationsAll = useMemo<IConversation[]>(
    () => conversationsQuery.data?.data ?? [],
    [conversationsQuery.data],
  );

  const conversationsScoped = useMemo<IConversation[]>(() => {
    return conversationsAll.filter((c) => {
      if (filters.sellerId && filters.sellerId !== "all" && c.assignedSellerId !== filters.sellerId)
        return false;
      return true;
    });
  }, [conversationsAll, filters.sellerId]);

  const conversationsCurrent = useMemo<IConversation[]>(() => {
    return conversationsScoped.filter(
      (c) => c.createdAt >= period.start && c.createdAt <= period.end,
    );
  }, [conversationsScoped, period.start, period.end]);

  const conversationsPrev = useMemo<IConversation[]>(() => {
    return conversationsScoped.filter((c) => c.createdAt >= prev.start && c.createdAt <= prev.end);
  }, [conversationsScoped, prev.start, prev.end]);

  const messagesQuery = useQuery({
    queryKey: [
      "csa",
      "messages",
      filters.storeId,
      filters.sellerId,
      period.start,
      period.end,
      conversationsCurrent.map((c) => c.id).join(","),
    ],
    queryFn: () =>
      messagesProvider.listForAnalytics({
        conversationIds: conversationsCurrent.map((c) => c.id),
        since: period.start,
        until: period.end,
      }),
    staleTime: STALE_MS,
    enabled: conversationsCurrent.length > 0,
  });

  const metrics = useMemo<ICustomerServiceMetrics | null>(() => {
    if (!conversationsQuery.data || !ordersQuery.data || !sellersQuery.data) return null;
    const rawOrders: IOrder[] = ordersQuery.data.data ?? [];
    const paidOrders = rawOrders.filter(
      (o) => o.paymentStatus === "pago" || o.paymentStatus === "parcial",
    );
    const escalations: ISdrEscalation[] = escalationsQuery.data ?? [];
    const messages: IMessage[] = messagesQuery.data ?? [];
    return calculateCustomerServiceMetrics({
      conversations: conversationsScoped,
      conversationsPrevious: conversationsPrev,
      messages,
      paidOrders,
      escalations,
      sellers: sellersQuery.data,
      period,
    });
  }, [
    conversationsScoped,
    conversationsPrev,
    conversationsQuery.data,
    ordersQuery.data,
    escalationsQuery.data,
    messagesQuery.data,
    sellersQuery.data,
    period,
  ]);

  return {
    isLoading: conversationsQuery.isLoading || ordersQuery.isLoading || sellersQuery.isLoading,
    isError:
      conversationsQuery.isError ||
      ordersQuery.isError ||
      sellersQuery.isError ||
      escalationsQuery.isError,
    refetch: () => {
      void conversationsQuery.refetch();
      void ordersQuery.refetch();
      void sellersQuery.refetch();
      void escalationsQuery.refetch();
      void messagesQuery.refetch();
    },
    metrics,
    sellers: sellersQuery.data ?? [],
  };
}
