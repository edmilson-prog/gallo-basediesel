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

/**
 * How far back the `last_message_at` server filter is widened so that
 * conversations *created* inside the window are never dropped by an older
 * backfilled `last_message_at`. See the call site for the full rationale.
 */
const IMPORT_SKEW_MARGIN_MS = 90 * 24 * 60 * 60 * 1000;

function withSkewMargin(iso: string): string {
  return new Date(new Date(iso).getTime() - IMPORT_SKEW_MARGIN_MS).toISOString();
}

/** Orders that count as revenue — mirrors `useCustomerServiceMetrics`. */
function isPaidOrder(order: IOrder): boolean {
  return order.paymentStatus === "pago" || order.paymentStatus === "parcial";
}

function isWithin(iso: string, startIso: string, endIso: string): boolean {
  return iso >= startIso && iso <= endIso;
}

export interface IUseSellerServiceMetricsParams {
  storeId: ID;
  sellerId: ID;
  window: ISellerPeriodWindow;
}

export interface IUseSellerServiceMetricsResult {
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
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
        // `fromDate`/`toDate` bound `last_message_at`, but the windowing below
        // slices on `createdAt`. A thread created inside the window whose last
        // message is older (history importers backfill `last_message_at` from
        // the imported thread) would be dropped server-side before the client
        // filter ever saw it, under-reporting the seller's own conversations.
        // Backing the lower bound off by a fixed margin keeps the fetch a
        // superset of what the `createdAt` filter needs, while staying bounded
        // (an unbounded floor would pull the seller's entire history and hit
        // the page cap). The upper bound needs no margin: `last_message_at`
        // only moves forward.
        fromDate: withSkewMargin(window.previousStartIso),
        toDate: window.endIso,
        pageSize: PAGE_SIZE,
        // The exact count re-runs the per-row `can_access_conversation` RLS
        // gate over the whole candidate set — the shape the contract blames for
        // the 2026-07-02 statement-timeout incident — and `total` is unused.
        withTotal: false,
      }),
    staleTime: STALE_MS,
    enabled: Boolean(storeId) && Boolean(sellerId),
  });

  const ordersQuery = useQuery({
    queryKey: [
      "seller-dashboard",
      "orders",
      storeId,
      sellerId,
      window.previousStartIso,
      window.endIso,
    ],
    queryFn: () =>
      ordersProvider.list({
        storeId,
        sellerId,
        since: window.previousStartIso,
        until: window.endIso,
        pageSize: PAGE_SIZE,
      }),
    staleTime: STALE_MS,
    enabled: Boolean(storeId) && Boolean(sellerId),
  });

  const escalationsQuery = useQuery({
    queryKey: ["seller-dashboard", "escalations", storeId, window.startIso, window.endIso],
    queryFn: () =>
      sdrEscalationsProvider.list({ storeId, fromDate: window.startIso, toDate: window.endIso }),
    staleTime: STALE_MS,
    enabled: Boolean(storeId) && Boolean(sellerId),
  });

  const sellersQuery = useQuery({
    queryKey: ["seller-dashboard", "sellers", storeId],
    queryFn: () => sellersProvider.list({ storeId, active: true }),
    staleTime: STALE_MS,
    enabled: Boolean(storeId) && Boolean(sellerId),
  });

  const conversationsAll = useMemo<IConversation[]>(
    () => conversationsQuery.data?.data ?? [],
    [conversationsQuery.data],
  );

  const conversationsCurrent = useMemo<IConversation[]>(
    () =>
      conversationsAll.filter(
        (c) => c.createdAt >= window.startIso && c.createdAt <= window.endIso,
      ),
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

  // `parcial` counts as revenue here exactly as it does in the store-wide
  // `useCustomerServiceMetrics`. Keeping only `pago` made a seller's own screen
  // report R$ 0,00 for orders the gestor's analytics screen credited in full.
  const paidOrdersCurrent = useMemo<IOrder[]>(
    () =>
      (ordersQuery.data?.data ?? []).filter(
        (o) => isPaidOrder(o) && isWithin(o.createdAt, window.startIso, window.endIso),
      ),
    [ordersQuery.data, window.startIso, window.endIso],
  );

  const paidOrdersPrevious = useMemo<IOrder[]>(
    () =>
      (ordersQuery.data?.data ?? []).filter(
        (o) =>
          isPaidOrder(o) && isWithin(o.createdAt, window.previousStartIso, window.previousEndIso),
      ),
    [ordersQuery.data, window.previousStartIso, window.previousEndIso],
  );

  const salesCurrent = useMemo(
    () => paidOrdersCurrent.reduce((sum, o) => sum + o.total, 0),
    [paidOrdersCurrent],
  );

  const salesPrevious = useMemo(
    () => paidOrdersPrevious.reduce((sum, o) => sum + o.total, 0),
    [paidOrdersPrevious],
  );

  const metrics = useMemo<ICustomerServiceMetrics | null>(() => {
    if (!conversationsQuery.data || !ordersQuery.data || !sellersQuery.data) return null;
    const escalations: ISdrEscalation[] = escalationsQuery.data ?? [];
    const messages: IMessage[] = messagesQuery.data ?? [];
    const sellers = sellersQuery.data;

    // The engine takes ONE `paidOrders` array and reuses it for both the
    // current and the previous window. Since `hadConversion` has no upper
    // bound (any paid order of that customer created after the conversation
    // counts), feeding it the whole super-window credited yesterday's
    // conversations with today's orders — inflating `previous.conversionRate`
    // and rendering a red "collapse" that never happened. Running the engine
    // once per window, each with its own orders, keeps the comparison honest.
    const current = calculateCustomerServiceMetrics({
      conversations: conversationsCurrent,
      messages,
      paidOrders: paidOrdersCurrent,
      escalations,
      sellers,
      period: { start: window.startIso, end: window.endIso },
    });

    const previous = calculateCustomerServiceMetrics({
      conversations: conversationsPrevious,
      // Messages are fetched only for the current window; the previous window's
      // response/handle times are consequently 0. That is inert here — the KPI
      // row renders deltas only for conversations, conversion and sales.
      messages: [],
      paidOrders: paidOrdersPrevious,
      escalations,
      sellers,
      period: { start: window.previousStartIso, end: window.previousEndIso },
    });

    return { ...current, previous: previous.totals };
  }, [
    conversationsCurrent,
    conversationsPrevious,
    conversationsQuery.data,
    ordersQuery.data,
    paidOrdersCurrent,
    paidOrdersPrevious,
    escalationsQuery.data,
    messagesQuery.data,
    sellersQuery.data,
    window.startIso,
    window.endIso,
    window.previousStartIso,
    window.previousEndIso,
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
    conversationsCurrent,
    salesCurrent,
    salesPrevious,
  };
}
