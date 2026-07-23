import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, ILead, IOrder, IQuote } from "@/shared/types";
import {
  FETCH_ALL_PAGE_SIZE,
  useLeadsProvider,
  useOrdersProvider,
  useQuotesProvider,
} from "@/providers/data";
import type { ISalesWindow } from "./useSalesFilters";

export interface IFunnelStage {
  id: "leads" | "qualified" | "quotes_sent" | "quotes_accepted" | "orders_paid";
  label: string;
  count: number;
  /** Conversion from previous stage (0..1), null when previous is zero. */
  conversionFromPrevious: number | null;
  /** Sample IDs (first 5) for the drill-down panel. */
  sampleIds: ID[];
}

export interface IUseFunnelMetricsParams {
  storeId?: ID;
  sellerId?: ID;
  window: ISalesWindow;
}

export interface IUseFunnelMetricsResult {
  stages: IFunnelStage[];
  isLoading: boolean;
  hasError: boolean;
  /** Index of the stage with the deepest relative drop (the "bottleneck"). */
  bottleneckIndex: number | null;
  /** Source rows kept so the UI can build drill-down lists. */
  sources: {
    leads: ILead[];
    quotes: IQuote[];
    orders: IOrder[];
  };
}

const QUALIFICATION_STAGES = new Set<ID>([
  "stage-qualificacao",
  "stage-orcamento",
  "stage-negociacao",
  "stage-fechado",
]);

const QUOTES_SENT_STATUSES = new Set<IQuote["status"]>([
  "enviado",
  "aceito",
  "recusado",
  "expirado",
  "convertido",
]);

const QUOTES_ACCEPTED_STATUSES = new Set<IQuote["status"]>(["aceito", "convertido"]);

const STALE_MS = 30_000;

function withinWindow(iso: string | undefined, window: ISalesWindow): boolean {
  if (!iso) return false;
  return iso >= window.fromIso && iso <= window.toIso;
}

/**
 * Funnel KPIs across the lead → quote → order chain (PRD-041 Aba 4).
 *
 * Stages:
 * 1. **Leads no período** — leads with `createdAt` in window.
 * 2. **Qualificados** — leads currently in qualification stages or later.
 * 3. **Orçamentos enviados** — quotes whose status reached `enviado` or beyond, created in window.
 * 4. **Orçamentos aceitos** — quotes with status `aceito` or `convertido`.
 * 5. **Pedidos pagos** — orders with `paidAt` in window.
 */
export function useFunnelMetrics(params: IUseFunnelMetricsParams): IUseFunnelMetricsResult {
  const { storeId, sellerId, window } = params;

  const leadsProvider = useLeadsProvider();
  const quotesProvider = useQuotesProvider();
  const ordersProvider = useOrdersProvider();

  const leadsQuery = useQuery({
    queryKey: ["funnel", "leads", storeId, sellerId],
    queryFn: () => leadsProvider.list({ storeId, sellerId, pageSize: FETCH_ALL_PAGE_SIZE }),
    staleTime: STALE_MS,
  });

  const quotesQuery = useQuery({
    queryKey: ["funnel", "quotes", storeId, sellerId, window.fromIso, window.toIso],
    queryFn: () =>
      quotesProvider.list({
        storeId,
        sellerId,
        createdAfter: window.fromIso,
        createdBefore: window.toIso,
        pageSize: 2000,
      }),
    staleTime: STALE_MS,
  });

  const ordersQuery = useQuery({
    queryKey: ["funnel", "orders", storeId, sellerId, window.fromIso, window.toIso],
    queryFn: () =>
      ordersProvider.list({
        storeId,
        sellerId,
        paymentStatus: "pago",
        since: window.fromIso,
        until: window.toIso,
        pageSize: 2000,
      }),
    staleTime: STALE_MS,
  });

  const isLoading = leadsQuery.isLoading || quotesQuery.isLoading || ordersQuery.isLoading;
  const hasError = leadsQuery.isError || quotesQuery.isError || ordersQuery.isError;

  const stages = useMemo<IFunnelStage[]>(() => {
    const leads = leadsQuery.data?.data ?? [];
    const quotes = quotesQuery.data?.data ?? [];
    const orders = ordersQuery.data?.data ?? [];

    const leadsInWindow = leads.filter((l) => withinWindow(l.createdAt, window));
    const qualified = leadsInWindow.filter((l) => QUALIFICATION_STAGES.has(l.stage.id));
    const quotesSent = quotes.filter((q) => QUOTES_SENT_STATUSES.has(q.status));
    const quotesAccepted = quotes.filter((q) => QUOTES_ACCEPTED_STATUSES.has(q.status));
    const ordersPaid = orders;

    const ratio = (current: number, previous: number): number | null => {
      if (previous <= 0) return null;
      return current / previous;
    };

    return [
      {
        id: "leads",
        label: "Leads no período",
        count: leadsInWindow.length,
        conversionFromPrevious: null,
        sampleIds: leadsInWindow.slice(0, 5).map((l) => l.id),
      },
      {
        id: "qualified",
        label: "Qualificados",
        count: qualified.length,
        conversionFromPrevious: ratio(qualified.length, leadsInWindow.length),
        sampleIds: qualified.slice(0, 5).map((l) => l.id),
      },
      {
        id: "quotes_sent",
        label: "Orçamentos enviados",
        count: quotesSent.length,
        conversionFromPrevious: ratio(quotesSent.length, qualified.length),
        sampleIds: quotesSent.slice(0, 5).map((q) => q.id),
      },
      {
        id: "quotes_accepted",
        label: "Orçamentos aceitos",
        count: quotesAccepted.length,
        conversionFromPrevious: ratio(quotesAccepted.length, quotesSent.length),
        sampleIds: quotesAccepted.slice(0, 5).map((q) => q.id),
      },
      {
        id: "orders_paid",
        label: "Pedidos pagos",
        count: ordersPaid.length,
        conversionFromPrevious: ratio(ordersPaid.length, quotesAccepted.length),
        sampleIds: ordersPaid.slice(0, 5).map((o) => o.id),
      },
    ];
  }, [leadsQuery.data, quotesQuery.data, ordersQuery.data, window]);

  /** Identify the stage with the deepest relative drop. Skip the first stage. */
  const bottleneckIndex = useMemo(() => {
    let worstIdx: number | null = null;
    let worstRatio = 1;
    for (let i = 1; i < stages.length; i += 1) {
      const r = stages[i].conversionFromPrevious;
      if (r === null) continue;
      if (r < worstRatio) {
        worstRatio = r;
        worstIdx = i;
      }
    }
    // Only highlight when the drop is notable (< 70% conversion).
    if (worstIdx !== null && worstRatio < 0.7) return worstIdx;
    return null;
  }, [stages]);

  return {
    stages,
    isLoading,
    hasError,
    bottleneckIndex,
    sources: {
      leads: leadsQuery.data?.data ?? [],
      quotes: quotesQuery.data?.data ?? [],
      orders: ordersQuery.data?.data ?? [],
    },
  };
}
