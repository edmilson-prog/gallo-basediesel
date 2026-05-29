import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useOrdersProvider, useSellersProvider } from "@/providers/data";
import { useGoalsWithProgress } from "@/features/goals/hooks/useGoalsWithProgress";
import { SALES_ANALYTICS_STRINGS as S } from "../i18n/pt-BR";
import {
  buildDailyEvolution,
  buildSellerEvolution,
  computeEvolutionKpis,
  type IDailyEvolutionPoint,
  type IEvolutionKpis,
  type ISellerEvolutionSeries,
} from "../utils/evolution";

const STALE_MS = 30_000;

export interface IUseSalesEvolutionParams {
  scope: { storeId?: ID; sellerId?: ID };
}

export interface IUseSalesEvolutionResult {
  isLoading: boolean;
  hasError: boolean;
  hasGoal: boolean;
  referenceDate: Date;
  points: IDailyEvolutionPoint[];
  sellerSeries: ISellerEvolutionSeries[];
  kpis: IEvolutionKpis;
}

function monthRangeIso(year: number, month: number): { sinceIso: string; untilIso: string } {
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { sinceIso: start.toISOString(), untilIso: end.toISOString() };
}

export function useSalesEvolution(params: IUseSalesEvolutionParams): IUseSalesEvolutionResult {
  const { scope } = params;
  const ordersProvider = useOrdersProvider();
  const sellersProvider = useSellersProvider();

  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth();

  const cur = useMemo(() => monthRangeIso(year, month), [year, month]);
  const prev = useMemo(() => monthRangeIso(year, month - 1), [year, month]);
  const lastYear = useMemo(() => monthRangeIso(year - 1, month), [year, month]);

  const baseKey = ["sales-evolution", scope.storeId, scope.sellerId] as const;

  const curQuery = useQuery({
    queryKey: [...baseKey, "current", cur.sinceIso],
    queryFn: () =>
      ordersProvider.list({
        storeId: scope.storeId,
        sellerId: scope.sellerId,
        paymentStatus: "pago",
        since: cur.sinceIso,
        until: cur.untilIso,
        pageSize: 2000,
      }),
    staleTime: STALE_MS,
  });

  const prevQuery = useQuery({
    queryKey: [...baseKey, "previous", prev.sinceIso],
    queryFn: () =>
      ordersProvider.list({
        storeId: scope.storeId,
        sellerId: scope.sellerId,
        paymentStatus: "pago",
        since: prev.sinceIso,
        until: prev.untilIso,
        pageSize: 2000,
      }),
    staleTime: STALE_MS,
  });

  const lastYearQuery = useQuery({
    queryKey: [...baseKey, "lastYear", lastYear.sinceIso],
    queryFn: () =>
      ordersProvider.list({
        storeId: scope.storeId,
        sellerId: scope.sellerId,
        paymentStatus: "pago",
        since: lastYear.sinceIso,
        until: lastYear.untilIso,
        pageSize: 2000,
      }),
    staleTime: STALE_MS,
  });

  const sellersQuery = useQuery({
    queryKey: ["sales-evolution", "sellers", scope.storeId],
    queryFn: () => sellersProvider.list({ storeId: scope.storeId }),
    staleTime: STALE_MS,
  });

  const goals = useGoalsWithProgress({
    storeId: scope.storeId,
    sellerId: scope.sellerId,
    statuses: ["ativa"],
  });

  // Resolve the active monthly revenue target for the current month.
  const targetValue = useMemo<number | null>(() => {
    const wantLevel = scope.sellerId ? "individual" : "store";
    const match = goals.items.find(({ goal }) => {
      if (goal.metric !== "revenue") return false;
      if (goal.period.type !== "monthly") return false;
      if (goal.level !== wantLevel) return false;
      const startMonth = new Date(goal.period.start).getMonth();
      const startYear = new Date(goal.period.start).getFullYear();
      return startMonth === month && startYear === year;
    });
    return match ? match.goal.targetValue : null;
  }, [goals.items, scope.sellerId, month, year]);

  const sellerNameById = useMemo(() => {
    const map = new Map<ID, string>();
    for (const s of sellersQuery.data ?? []) map.set(s.id, s.fullName);
    return map;
  }, [sellersQuery.data]);

  const isLoading =
    curQuery.isLoading || prevQuery.isLoading || lastYearQuery.isLoading || goals.isLoading;
  const hasError = curQuery.isError || prevQuery.isError || lastYearQuery.isError || goals.hasError;

  const points = useMemo(
    () =>
      buildDailyEvolution({
        referenceDate: now,
        currentMonthOrders: curQuery.data?.data ?? [],
        previousMonthOrders: prevQuery.data?.data ?? [],
        lastYearMonthOrders: lastYearQuery.data?.data ?? [],
        targetValue,
      }),
    [now, curQuery.data, prevQuery.data, lastYearQuery.data, targetValue],
  );

  const sellerSeries = useMemo(
    () => buildSellerEvolution(curQuery.data?.data ?? [], sellerNameById, now, S.evolutionOutros),
    [curQuery.data, sellerNameById, now],
  );

  const kpis = useMemo(
    () => computeEvolutionKpis(points, now, targetValue),
    [points, now, targetValue],
  );

  return {
    isLoading,
    hasError,
    hasGoal: targetValue != null,
    referenceDate: now,
    points,
    sellerSeries,
    kpis,
  };
}
