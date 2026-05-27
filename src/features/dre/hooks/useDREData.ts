import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IDREPeriod, IDRETrendPoint, IOrder } from "@/shared/types";
import { useCommissionsProvider, useOrdersProvider, useSettingsProvider } from "@/providers/data";
import { calculateDRE, calculateDRETrend } from "../engine";

export type DREPeriodKind = "monthly" | "quarterly" | "yearly";

export interface IUseDREDataParams {
  storeId: ID;
  /** Anchor month inside the period — defaults to current month. */
  monthKey: string;
  /** Length of the period. Defaults to `monthly`. */
  kind?: DREPeriodKind;
  enabled?: boolean;
}

export interface IUseDREDataResult {
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  /** Resolved DRE record for the selected period + comparativos. */
  dre: IDREPeriod | null;
  /** 12-month trend ending on the anchor month. */
  trend: IDRETrendPoint[];
  /** All paid orders fetched for the analysis window (24 months). */
  paidOrders: IOrder[];
  /** Period span derived from `monthKey` + `kind`. */
  periodBounds: { startIso: string; endIso: string };
}

const STALE_MS = 60_000;
const PAGE_SIZE = 1000;

/** Resolve `[start, end]` of a DRE window given an anchor month + kind. */
export function resolvePeriodBounds(
  monthKey: string,
  kind: DREPeriodKind,
): { startIso: string; endIso: string } {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }
  if (kind === "yearly") {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 12, 0, 23, 59, 59, 999));
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }
  if (kind === "quarterly") {
    const q = Math.floor((month - 1) / 3);
    const start = new Date(Date.UTC(year, q * 3, 1));
    const end = new Date(Date.UTC(year, q * 3 + 3, 0, 23, 59, 59, 999));
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function shiftMonths(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Fetches orders + commissions + settings and runs the DRE engine for the
 * requested period. Pulls a 24-month window so the comparativos (vs previous
 * period, vs same period last year) + the 12-month trend can be computed
 * client-side without extra requests.
 */
export function useDREData(params: IUseDREDataParams): IUseDREDataResult {
  const { storeId, monthKey, kind = "monthly", enabled = true } = params;
  const ordersProvider = useOrdersProvider();
  const commissionsProvider = useCommissionsProvider();
  const settingsProvider = useSettingsProvider();

  const periodBounds = useMemo(() => resolvePeriodBounds(monthKey, kind), [monthKey, kind]);

  // Fetch a generous window so trend + year-over-year + previous-period all fit
  // (≥ 24 months ending at the current period's end).
  const fetchWindow = useMemo(() => {
    const end = new Date(periodBounds.endIso);
    const start = new Date(Date.UTC(end.getUTCFullYear() - 2, end.getUTCMonth(), 1, 0, 0, 0));
    return { since: start.toISOString(), until: periodBounds.endIso };
  }, [periodBounds]);

  const ordersQuery = useQuery({
    queryKey: ["dre", "orders", storeId, fetchWindow.since, fetchWindow.until],
    queryFn: () =>
      ordersProvider.list({
        storeId,
        since: fetchWindow.since,
        until: fetchWindow.until,
        pageSize: PAGE_SIZE,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const commissionsQuery = useQuery({
    queryKey: ["dre", "commissions", storeId],
    queryFn: () => commissionsProvider.list({ storeId, pageSize: PAGE_SIZE }),
    staleTime: STALE_MS,
    enabled,
  });

  const settingsQuery = useQuery({
    queryKey: ["dre", "settings", storeId],
    queryFn: () => settingsProvider.get(storeId),
    staleTime: STALE_MS,
    enabled,
  });

  const ordersData = ordersQuery.data?.data ?? [];
  const commissionsData = commissionsQuery.data?.data ?? [];
  const settingsData = settingsQuery.data ?? null;

  const { dre, trend, paidOrders } = useMemo<{
    dre: IDREPeriod | null;
    trend: IDRETrendPoint[];
    paidOrders: IOrder[];
  }>(() => {
    if (!settingsData) {
      return { dre: null, trend: [], paidOrders: [] };
    }
    const paid = ordersData.filter(
      (o) => o.paymentStatus === "pago" || o.paymentStatus === "parcial",
    );
    const returned = ordersData.filter((o) => o.fulfillmentStatus === "devolvido");
    const ctx = {
      paidOrders: paid,
      returnedOrders: returned,
      commissions: commissionsData,
      settings: settingsData.financialSettings,
      storeId,
    };
    const computed = calculateDRE(periodBounds.startIso, periodBounds.endIso, ctx);
    const trendSeries = calculateDRETrend(periodBounds.endIso, ctx);
    return { dre: computed, trend: trendSeries, paidOrders: paid };
  }, [ordersData, commissionsData, settingsData, periodBounds, storeId]);

  return {
    isLoading: ordersQuery.isLoading || commissionsQuery.isLoading || settingsQuery.isLoading,
    isError: ordersQuery.isError || commissionsQuery.isError || settingsQuery.isError,
    refetch: () => {
      void ordersQuery.refetch();
      void commissionsQuery.refetch();
      void settingsQuery.refetch();
    },
    dre,
    trend,
    paidOrders,
    periodBounds,
  };
}

/** Build a stable list of selectable monthKeys for the period picker. */
export function buildMonthOptions(monthCount = 12, now: Date = new Date()): string[] {
  const out: string[] = [];
  const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  for (let i = 0; i < monthCount; i += 1) {
    out.push(shiftMonths(current, -i));
  }
  return out;
}
