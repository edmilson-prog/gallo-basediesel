import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useOrdersProvider, useVehiclesProvider } from "@/providers/data";

/** Orders belonging to the portal company (PRD-071 RF-023). */
export function usePortalOrders(customerId: ID | undefined) {
  const provider = useOrdersProvider();
  return useQuery({
    queryKey: ["portal", "orders", customerId] as const,
    enabled: Boolean(customerId),
    staleTime: 60_000,
    queryFn: () => provider.listByCustomer(customerId!),
  });
}

/** Fleet vehicles belonging to the portal company (PRD-071 RF-012). */
export function usePortalVehicles(customerId: ID | undefined) {
  const provider = useVehiclesProvider();
  return useQuery({
    queryKey: ["portal", "vehicles", customerId] as const,
    enabled: Boolean(customerId),
    staleTime: 60_000,
    queryFn: () => provider.listByCustomer(customerId!),
  });
}
