import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IProductIndicator, IIndicatorProgress } from "@/shared/types";
import { useIndicatorsProvider, useOrdersProvider, usePartsProvider } from "@/providers/data";
import type { IListIndicatorsParams } from "@/providers/data";
import { calculateIndicatorProgress } from "../engine/calculate";

const STALE_MS = 30_000;

export interface IIndicatorWithProgress {
  indicator: IProductIndicator;
  progress: IIndicatorProgress;
}

/**
 * Lists indicators (optionally filtered) and computes each one's progress from
 * a single shared orders+parts load. Used by the dashboard.
 */
export function useIndicators(params: IListIndicatorsParams = {}) {
  const indicatorsProvider = useIndicatorsProvider();
  const ordersProvider = useOrdersProvider();
  const partsProvider = usePartsProvider();

  const listQuery = useQuery({
    queryKey: ["indicators", "list", params],
    queryFn: () => indicatorsProvider.list({ pageSize: 500, ...params }),
    staleTime: STALE_MS,
  });

  const ordersQuery = useQuery({
    queryKey: ["indicators", "all-orders", params.storeId],
    queryFn: () =>
      ordersProvider.list({ storeId: params.storeId, paymentStatus: "pago", pageSize: 5000 }),
    staleTime: STALE_MS,
  });

  const partsQuery = useQuery({
    queryKey: ["indicators", "progress-parts"],
    queryFn: () => partsProvider.list({ pageSize: 5000 }),
    staleTime: STALE_MS,
  });

  const items: IIndicatorWithProgress[] = useMemo(() => {
    const indicators = listQuery.data?.data ?? [];
    const orders = ordersQuery.data?.data ?? [];
    const parts = partsQuery.data?.data ?? [];
    return indicators.map((indicator) => ({
      indicator,
      progress: calculateIndicatorProgress(indicator, { orders, parts }),
    }));
  }, [listQuery.data, ordersQuery.data, partsQuery.data]);

  return {
    items,
    isLoading: listQuery.isLoading || ordersQuery.isLoading || partsQuery.isLoading,
    hasError: listQuery.isError || ordersQuery.isError || partsQuery.isError,
    refetch: () => {
      void listQuery.refetch();
      void ordersQuery.refetch();
      void partsQuery.refetch();
    },
  };
}

export function useStoreIndicators(storeId: ID | undefined) {
  return useIndicators(storeId ? { storeId } : {});
}
