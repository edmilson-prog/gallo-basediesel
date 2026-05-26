import { useQuery } from "@tanstack/react-query";
import type { ID, IQuote } from "@/shared/types";
import { useQuotesProvider } from "@/providers/data";

export interface ISdrQuoteMetricsFilters {
  storeId?: ID;
  fromDate?: string;
  toDate?: string;
}

export interface ISdrQuoteMetrics {
  totalQuotes: number;
  acceptedRate: number;
  rejectedRate: number;
  /** Quotes still awaiting a customer reply (status === `enviado`). */
  pendingCount: number;
  /** Sum of `total` across every SDR quote in the period. */
  movedRevenue: number;
  /** Average ticket of SDR quotes (movedRevenue / totalQuotes). */
  averageTicket: number;
}

function computeMetrics(quotes: IQuote[]): ISdrQuoteMetrics {
  const sdrQuotes = quotes.filter((q) => q.origin === "sdr");
  const total = sdrQuotes.length;
  if (total === 0) {
    return {
      totalQuotes: 0,
      acceptedRate: 0,
      rejectedRate: 0,
      pendingCount: 0,
      movedRevenue: 0,
      averageTicket: 0,
    };
  }
  const accepted = sdrQuotes.filter(
    (q) => q.status === "aceito" || q.status === "convertido",
  ).length;
  const rejected = sdrQuotes.filter((q) => q.status === "recusado").length;
  const pending = sdrQuotes.filter((q) => q.status === "enviado").length;
  const movedRevenue = sdrQuotes.reduce((acc, q) => acc + q.total, 0);
  return {
    totalQuotes: total,
    acceptedRate: round(accepted / total),
    rejectedRate: round(rejected / total),
    pendingCount: pending,
    movedRevenue: round2(movedRevenue),
    averageTicket: round2(movedRevenue / total),
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Aggregated SDR-quote metrics (PRD-022 RF-026/027) — used by the painel
 * (PRD-024) and the admin settings page so Owners can see whether the
 * automated quoting is producing real revenue.
 */
export function useSdrQuoteMetrics(filters: ISdrQuoteMetricsFilters = {}) {
  const provider = useQuotesProvider();
  return useQuery<ISdrQuoteMetrics>({
    queryKey: ["sdr-quote", "metrics", filters],
    queryFn: async () => {
      const page = await provider.list({ storeId: filters.storeId, pageSize: 500 });
      return computeMetrics(page.items);
    },
    staleTime: 30_000,
  });
}
