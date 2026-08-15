import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import {
  FETCH_ALL_PAGE_SIZE,
  useCustomersProvider,
  useGoalsProvider,
  useOrdersProvider,
  useQuotesProvider,
  useSellersProvider,
} from "@/providers/data";
import {
  buildSellerLeaderboard,
  type IBuildSellerLeaderboardResult,
  type SellerRankMetric,
} from "../utils/sellerLeaderboard";

const STALE_MS = 30_000;

export interface IUseSellerLeaderboardParams {
  /** Store scope; leaderboard is always computed store-wide (never seller-locked). */
  storeId?: ID;
  metric: SellerRankMetric;
}

export interface IUseSellerLeaderboardResult extends IBuildSellerLeaderboardResult {
  isLoading: boolean;
  hasError: boolean;
  referenceDate: Date;
}

function monthRangeIso(year: number, month: number): { sinceIso: string; untilIso: string } {
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { sinceIso: start.toISOString(), untilIso: end.toISOString() };
}

export function useSellerLeaderboard(
  params: IUseSellerLeaderboardParams,
): IUseSellerLeaderboardResult {
  const { storeId, metric } = params;
  const ordersProvider = useOrdersProvider();
  const sellersProvider = useSellersProvider();
  const quotesProvider = useQuotesProvider();
  const goalsProvider = useGoalsProvider();
  const customersProvider = useCustomersProvider();

  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth();
  const cur = useMemo(() => monthRangeIso(year, month), [year, month]);
  const prev = useMemo(() => monthRangeIso(year, month - 1), [year, month]);

  const queries = useQueries({
    queries: [
      {
        queryKey: ["seller-leaderboard", "orders-cur", storeId, cur.sinceIso],
        queryFn: () =>
          ordersProvider.list({
            storeId,
            paymentStatus: "pago",
            since: cur.sinceIso,
            until: cur.untilIso,
            pageSize: 2000,
          }),
        staleTime: STALE_MS,
      },
      {
        queryKey: ["seller-leaderboard", "orders-prev", storeId, prev.sinceIso],
        queryFn: () =>
          ordersProvider.list({
            storeId,
            paymentStatus: "pago",
            since: prev.sinceIso,
            until: prev.untilIso,
            pageSize: 2000,
          }),
        staleTime: STALE_MS,
      },
      {
        queryKey: ["seller-leaderboard", "sellers", storeId],
        queryFn: () => sellersProvider.list({ storeId }),
        staleTime: STALE_MS,
      },
      {
        queryKey: ["seller-leaderboard", "quotes-open", storeId],
        queryFn: () => quotesProvider.list({ storeId, status: "enviado", pageSize: 2000 }),
        staleTime: STALE_MS,
      },
      {
        queryKey: ["seller-leaderboard", "goals", storeId],
        queryFn: () => goalsProvider.list({ storeId, pageSize: 500 }),
        staleTime: STALE_MS,
      },
      {
        queryKey: ["seller-leaderboard", "customers", storeId],
        queryFn: () => customersProvider.list({ storeId, pageSize: FETCH_ALL_PAGE_SIZE }),
        staleTime: STALE_MS,
      },
    ],
  });

  const [ordersCur, ordersPrev, sellersQ, quotesQ, goalsQ, customersQ] = queries;
  const isLoading = queries.some((q) => q.isLoading);
  const hasError = queries.some((q) => q.isError);

  const targetBySeller = useMemo(() => {
    const map = new Map<ID, number>();
    for (const goal of goalsQ.data?.data ?? []) {
      if (goal.level !== "individual") continue;
      if (goal.metric !== "revenue") continue;
      if (goal.period.type !== "monthly") continue;
      const start = new Date(goal.period.start);
      if (start.getMonth() !== month || start.getFullYear() !== year) continue;
      if (!goal.targetId) continue;
      map.set(goal.targetId, goal.targetValue);
    }
    return map;
  }, [goalsQ.data, month, year]);

  const customerCountBySeller = useMemo(() => {
    const map = new Map<ID, number>();
    for (const c of customersQ.data?.data ?? []) {
      if (!c.sellerId) continue;
      map.set(c.sellerId, (map.get(c.sellerId) ?? 0) + 1);
    }
    return map;
  }, [customersQ.data]);

  const result = useMemo(
    () =>
      buildSellerLeaderboard(
        {
          referenceDate: now,
          sellers: sellersQ.data ?? [],
          currentMonthOrders: ordersCur.data?.data ?? [],
          previousMonthOrders: ordersPrev.data?.data ?? [],
          openQuotes: quotesQ.data?.data ?? [],
          customerCountBySeller,
          targetBySeller,
        },
        metric,
      ),
    [
      now,
      sellersQ.data,
      ordersCur.data,
      ordersPrev.data,
      quotesQ.data,
      customerCountBySeller,
      targetBySeller,
      metric,
    ],
  );

  return { ...result, isLoading, hasError, referenceDate: now };
}
