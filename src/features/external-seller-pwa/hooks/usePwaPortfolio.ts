import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useCustomersProvider } from "@/providers/data";

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
      const result = await provider.list({ sellerId, search, pageSize: 200 });
      return result.data;
    },
  });
}
