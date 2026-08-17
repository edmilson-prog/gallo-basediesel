import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ICustomer } from "@/shared/types";
import { useOrdersProvider } from "@/providers/data/hooks/useOrdersProvider";
import { useQuotesProvider } from "@/providers/data/hooks/useQuotesProvider";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { useRecommendationsProvider } from "@/providers/data/hooks/useRecommendationsProvider";
import { useConversationsProvider } from "@/providers/data/hooks/useConversationsProvider";
import { useContactsProvider } from "@/providers/data";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { useStoresProvider } from "@/providers/data/hooks/useStoresProvider";
import { buildCustomerAlerts, type ICustomerAlert } from "../engine/customerAlerts";
import { resolveCustomerCredit, type ICustomerCredit } from "../engine/customerCredit";
import { buildMonthlyPurchaseSeries, type IMonthlyPurchasePoint } from "../utils/purchaseSeries";

/** Recommendation types the MVP surfaces — mirrors `CustomerPendingActionsCard`. */
const MVP_REC_TYPES = ["recovery", "vehicle_maintenance", "follow_up"] as const;

/** Quote states that still count as "open" for the customer. */
const OPEN_QUOTE_STATUSES = ["enviado", "rascunho"] as const;

export interface ICustomerTabCounts {
  orders: number;
  quotes: number;
  vehicles: number;
  conversations: number;
  /** People who speak for this company — the Agenda contacts linked to it. */
  contacts: number;
  notes: number;
  recommendations: number;
  /** Sum shown on the consolidated "Comercial" tab. */
  comercial: number;
  /** Sum shown on the consolidated "Notas" tab. */
  notas: number;
}

export interface ICustomerHeaderData {
  alerts: ICustomerAlert[];
  credit: ICustomerCredit | null;
  series: IMonthlyPurchasePoint[];
  /** True when at least one paid order landed in the last 12 months. */
  hasPurchaseHistory: boolean;
  openQuotes: number;
  counts: ICustomerTabCounts;
  sellerName: string | null;
  storeName: string | null;
  /** Most recent conversation, for the "Abrir conversa" quick action. */
  latestConversationId: string | null;
}

/**
 * Single source of the derived data the refactored detail page needs: the alert
 * band, the commercial band and every tab counter.
 *
 * Gathering it in one hook keeps the bands free of data fetching and means the
 * tab counters and the alerts can never disagree — they read the same numbers.
 * Each query keeps its own key so TanStack Query still shares the cache with
 * the tabs that fetch the same lists on their own.
 */
export function useCustomerHeader(customer: ICustomer): ICustomerHeaderData {
  const ordersProvider = useOrdersProvider();
  const quotesProvider = useQuotesProvider();
  const vehiclesProvider = useVehiclesProvider();
  const recommendationsProvider = useRecommendationsProvider();
  const conversationsProvider = useConversationsProvider();
  const contactsProvider = useContactsProvider();
  const sellersProvider = useSellersProvider();
  const storesProvider = useStoresProvider();

  const ordersQuery = useQuery({
    queryKey: ["customer-orders", customer.id] as const,
    staleTime: 60_000,
    queryFn: () => ordersProvider.listByCustomer(customer.id),
  });

  const quotesQuery = useQuery({
    queryKey: ["customer-quotes", customer.id] as const,
    staleTime: 60_000,
    queryFn: () =>
      quotesProvider.list({ customerId: customer.id, pageSize: 200 }).then((r) => r.data),
  });

  const vehiclesQuery = useQuery({
    queryKey: ["customer-vehicles", customer.id] as const,
    staleTime: 60_000,
    queryFn: () => vehiclesProvider.listByCustomer(customer.id),
  });

  const recommendationsQuery = useQuery({
    queryKey: ["customer-recommendations", customer.id] as const,
    staleTime: 60_000,
    queryFn: () =>
      recommendationsProvider
        .list({
          subjectId: customer.id,
          resolved: false,
          type: [...MVP_REC_TYPES],
          pageSize: 50,
        })
        .then((r) => r.data),
  });

  const conversationsQuery = useQuery({
    queryKey: ["customer-conversations", customer.id] as const,
    staleTime: 60_000,
    queryFn: () =>
      conversationsProvider
        .list({
          customerId: customer.id,
          pageSize: 100,
          orderBy: "lastMessageAt",
          orderDir: "desc",
        })
        .then((r) => r.data),
  });

  // Shares the key with `useCustomerContacts`, so opening the tab reuses this
  // fetch instead of issuing a second one.
  const contactsQuery = useQuery({
    queryKey: ["customer-contacts", customer.id] as const,
    staleTime: 60_000,
    queryFn: () =>
      contactsProvider
        .list({ customerId: customer.id, storeId: customer.storeId, pageSize: 100 })
        .then((r) => r.data),
  });

  const sellerQuery = useQuery({
    queryKey: ["seller", customer.sellerId] as const,
    staleTime: 5 * 60_000,
    enabled: customer.sellerId !== null,
    queryFn: () =>
      customer.sellerId ? sellersProvider.get(customer.sellerId).catch(() => null) : null,
  });

  const storeQuery = useQuery({
    queryKey: ["store", customer.storeId] as const,
    staleTime: 30 * 60_000,
    queryFn: () => storesProvider.get(customer.storeId).catch(() => null),
  });

  const orders = useMemo(() => ordersQuery.data ?? [], [ordersQuery.data]);
  const quotes = useMemo(() => quotesQuery.data ?? [], [quotesQuery.data]);
  const vehicles = useMemo(() => vehiclesQuery.data ?? [], [vehiclesQuery.data]);
  const recommendations = useMemo(
    () => recommendationsQuery.data ?? [],
    [recommendationsQuery.data],
  );
  const conversations = useMemo(() => conversationsQuery.data ?? [], [conversationsQuery.data]);

  const openQuotes = useMemo(
    () =>
      quotes.filter((q) => (OPEN_QUOTE_STATUSES as readonly string[]).includes(q.status)).length,
    [quotes],
  );

  const pendingVehicles = useMemo(
    () => vehicles.filter((v) => v.cadastroStatus === "pendente").length,
    [vehicles],
  );

  const series = useMemo(() => buildMonthlyPurchaseSeries(orders), [orders]);

  const alerts = useMemo(
    () =>
      buildCustomerAlerts({
        customer,
        openQuotes,
        pendingVehicles,
        unseenRecommendations: recommendations.length,
      }),
    [customer, openQuotes, pendingVehicles, recommendations.length],
  );

  const credit = useMemo(() => resolveCustomerCredit(customer, orders), [customer, orders]);

  return {
    alerts,
    credit,
    series,
    hasPurchaseHistory: series.some((point) => point.total > 0),
    openQuotes,
    counts: {
      orders: orders.length,
      quotes: quotes.length,
      vehicles: vehicles.length,
      conversations: conversations.length,
      contacts: contactsQuery.data?.length ?? 0,
      notes: customer.notes.length,
      recommendations: recommendations.length,
      comercial: orders.length + quotes.length,
      notas: customer.notes.length + recommendations.length,
    },
    sellerName: sellerQuery.data?.fullName ?? null,
    storeName: storeQuery.data?.name ?? null,
    latestConversationId: conversations[0]?.id ?? null,
  };
}
