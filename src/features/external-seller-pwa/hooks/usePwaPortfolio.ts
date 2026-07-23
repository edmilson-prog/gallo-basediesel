import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { FETCH_ALL_PAGE_SIZE, useCustomersProvider } from "@/providers/data";

/**
 * The signed-in external seller's portfolio (PRD-070 RF-009). Reuses the
 * shared customers provider filtered by `sellerId` — no mock duplication.
 */
export function usePwaPortfolio(sellerId: ID | undefined, search?: string) {
  const provider = useCustomersProvider();
  return useQuery({
    queryKey: ["pwa", "portfolio", sellerId, search ?? ""] as const,
    enabled: Boolean(sellerId),
    staleTime: 60_000,
    queryFn: async () => {
      const result = await provider.list({ sellerId, search, pageSize: FETCH_ALL_PAGE_SIZE });
      return result.data;
    },
  });
}
