import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, ISeller } from "@/shared/types";
import { useSellersProvider } from "@/providers/data";
import { usePortfolioMetrics, type IUsePortfolioMetricsResult } from "./usePortfolioMetrics";
import type { IPortfolioWindow } from "./usePortfolioFilters";
import type { ISellerPortfolio } from "../engine/calculatePortfolioMetrics";

export interface IUseSellerPortfolioResult extends IUsePortfolioMetricsResult {
  seller: ISeller | null;
  sellerMetrics: ISellerPortfolio | null;
}

/**
 * Drill-down hook — combines a `usePortfolioMetrics` scoped to a single seller
 * with the seller record itself (for the page header / KPIs that read the
 * seller's name and avatar).
 */
export function useSellerPortfolio(params: {
  sellerId: ID;
  window: IPortfolioWindow;
  storeId?: ID;
  enabled?: boolean;
}): IUseSellerPortfolioResult {
  const { sellerId, window, storeId, enabled = true } = params;

  const sellersProvider = useSellersProvider();
  const sellerQuery = useQuery({
    queryKey: ["portfolio", "seller", sellerId],
    queryFn: async () => {
      const sellers = await sellersProvider.list({ storeId, active: undefined });
      return sellers.find((s) => s.id === sellerId) ?? null;
    },
    enabled,
    staleTime: 60_000,
  });

  const metrics = usePortfolioMetrics({
    window,
    scope: { storeId, sellerId },
    enabled,
  });

  const sellerMetrics = useMemo<ISellerPortfolio | null>(() => {
    if (!metrics.metrics) return null;
    const found = metrics.metrics.bySeller.find((s) => s.sellerId === sellerId);
    return found ?? null;
  }, [metrics.metrics, sellerId]);

  return {
    ...metrics,
    seller: sellerQuery.data ?? null,
    sellerMetrics,
  };
}
