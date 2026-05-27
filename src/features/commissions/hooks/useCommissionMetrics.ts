import { useMemo } from "react";
import type { ICommission, ID } from "@/shared/types";
import { useCommissionsList } from "./useCommissionsList";
import { currentPeriod, previousPeriod } from "../utils/periods";

export interface IUseCommissionMetricsParams {
  storeId: ID;
  /** Defaults to current period. */
  period?: string;
  /** Restricts metrics to a single seller (drill-down or seller-self view). */
  sellerId?: ID;
  enabled?: boolean;
}

export interface ISellerCommissionAggregate {
  sellerId: ID;
  orderCount: number;
  baseCommission: number;
  goalBonus: number;
  total: number;
  paid: number;
  approved: number;
  calculated: number;
  disputed: number;
}

export interface IUseCommissionMetricsResult {
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  period: string;
  /** All commissions in the period. */
  commissions: ICommission[];
  /** Per-seller aggregates for the period. */
  bySeller: ISellerCommissionAggregate[];
  /** Totals across the period. */
  totals: {
    orderCount: number;
    baseCommission: number;
    goalBonus: number;
    total: number;
    paid: number;
    approved: number;
    calculated: number;
    disputed: number;
  };
  /** Total of the previous period for comparative widgets. */
  previousTotal: number;
  /** Variation (decimal) vs previous period; 0 when previous is 0. */
  previousDeltaPct: number;
}

const empty = (): ISellerCommissionAggregate["orderCount"] extends number ? IUseCommissionMetricsResult["totals"] : never => ({
  orderCount: 0,
  baseCommission: 0,
  goalBonus: 0,
  total: 0,
  paid: 0,
  approved: 0,
  calculated: 0,
  disputed: 0,
});

/**
 * Aggregates commissions in the period — per seller and totals — for the
 * commissions consolidated view (PRD-047) and the cockpit widget (PRD-040).
 */
export function useCommissionMetrics(
  params: IUseCommissionMetricsParams,
): IUseCommissionMetricsResult {
  const period = params.period ?? currentPeriod();
  const prev = previousPeriod(period);

  const current = useCommissionsList({
    storeId: params.storeId,
    period,
    sellerId: params.sellerId,
    enabled: params.enabled,
  });
  const previousList = useCommissionsList({
    storeId: params.storeId,
    period: prev,
    sellerId: params.sellerId,
    enabled: params.enabled,
  });

  const bySeller = useMemo<ISellerCommissionAggregate[]>(() => {
    const map = new Map<ID, ISellerCommissionAggregate>();
    for (const c of current.data) {
      const acc = map.get(c.sellerId) ?? {
        sellerId: c.sellerId,
        orderCount: 0,
        baseCommission: 0,
        goalBonus: 0,
        total: 0,
        paid: 0,
        approved: 0,
        calculated: 0,
        disputed: 0,
      };
      acc.orderCount += 1;
      acc.baseCommission += c.baseCommission;
      acc.goalBonus += c.goalBonus;
      acc.total += c.totalCommission;
      if (c.status === "paid") acc.paid += c.totalCommission;
      if (c.status === "approved") acc.approved += c.totalCommission;
      if (c.status === "calculated") acc.calculated += c.totalCommission;
      if (c.status === "disputed") acc.disputed += c.totalCommission;
      map.set(c.sellerId, acc);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [current.data]);

  const totals = useMemo(() => {
    const base = empty();
    for (const c of current.data) {
      base.orderCount += 1;
      base.baseCommission += c.baseCommission;
      base.goalBonus += c.goalBonus;
      base.total += c.totalCommission;
      if (c.status === "paid") base.paid += c.totalCommission;
      if (c.status === "approved") base.approved += c.totalCommission;
      if (c.status === "calculated") base.calculated += c.totalCommission;
      if (c.status === "disputed") base.disputed += c.totalCommission;
    }
    return base;
  }, [current.data]);

  const previousTotal = useMemo(
    () => previousList.data.reduce((sum, c) => sum + c.totalCommission, 0),
    [previousList.data],
  );

  const previousDeltaPct =
    previousTotal === 0 ? 0 : (totals.total - previousTotal) / previousTotal;

  return {
    isLoading: current.isLoading || previousList.isLoading,
    isError: current.isError || previousList.isError,
    refetch: () => {
      current.refetch();
      previousList.refetch();
    },
    period,
    commissions: current.data,
    bySeller,
    totals,
    previousTotal,
    previousDeltaPct,
  };
}
