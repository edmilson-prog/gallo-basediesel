import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IProductIndicator, IIndicatorProgress } from "@/shared/types";
import { useIndicatorsProvider, useOrdersProvider, usePartsProvider } from "@/providers/data";
import { calculateIndicatorProgress } from "../engine/calculate";

export interface IUseIndicatorProgressResult {
  indicator: IProductIndicator | undefined;
  progress: IIndicatorProgress | undefined;
  isLoading: boolean;
  hasError: boolean;
  refetch: () => void;
}

const STALE_MS = 30_000;

/**
 * Hook for a single product indicator (detail page). Loads the indicator first,
 * then orders + parts scoped to its store/seller — minimum data needed for an
 * accurate runtime progress recalc.
 */
export function useIndicatorProgress(indicatorId: ID | undefined): IUseIndicatorProgressResult {
  const indicatorsProvider = useIndicatorsProvider();
  const ordersProvider = useOrdersProvider();
  const partsProvider = usePartsProvider();

  const listQuery = useQuery({
    queryKey: ["indicators", "list", "all"],
    queryFn: () => indicatorsProvider.list({ pageSize: 500 }),
    staleTime: STALE_MS,
    enabled: Boolean(indicatorId),
  });

  const indicator = listQuery.data?.data.find((i) => i.id === indicatorId);

  const ordersQuery = useQuery({
    queryKey: [
      "indicators",
      "progress-orders",
      indicator?.storeId,
      indicator?.sellerId,
      indicator?.scopeLevel,
    ],
    queryFn: () =>
      ordersProvider.list({
        storeId: indicator?.storeId,
        sellerId: indicator?.scopeLevel === "individual" ? indicator.sellerId : undefined,
        paymentStatus: "pago",
        pageSize: 2000,
      }),
    staleTime: STALE_MS,
    enabled: Boolean(indicator),
  });

  const partsQuery = useQuery({
    queryKey: ["indicators", "progress-parts"],
    queryFn: () => partsProvider.list({ pageSize: 5000 }),
    staleTime: STALE_MS,
    enabled: Boolean(indicator),
  });

  const progress = useMemo(() => {
    if (!indicator) return undefined;
    return calculateIndicatorProgress(indicator, {
      orders: ordersQuery.data?.data ?? [],
      parts: partsQuery.data?.data ?? [],
    });
  }, [indicator, ordersQuery.data, partsQuery.data]);

  return {
    indicator,
    progress,
    isLoading: listQuery.isLoading || ordersQuery.isLoading || partsQuery.isLoading,
    hasError: listQuery.isError || ordersQuery.isError || partsQuery.isError,
    refetch: () => {
      void listQuery.refetch();
      void ordersQuery.refetch();
      void partsQuery.refetch();
    },
  };
}
