import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useOrdersProvider } from "@/providers/data/hooks/useOrdersProvider";

/**
 * Lists all orders attached to a given customer (PRD-065 RF-021).
 *
 * Uses the orders provider with `customerId` filter — the mock already sorts
 * by `createdAt` descending.
 */
export function useCustomerOrders(customerId: ID | undefined) {
  const provider = useOrdersProvider();
  return useQuery({
    queryKey: ["customer-account", "orders", customerId] as const,
    enabled: Boolean(customerId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!customerId) return [];
      const result = await provider.list({ customerId, pageSize: 200 });
      return result.data;
    },
  });
}
