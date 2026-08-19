import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useActivityProvider } from "@/providers/data";

/**
 * Folded attendance timeline for a customer.
 *
 * Isolated query key — deliberately distinct from the frozen conversation and
 * message cache keys. Never share or invalidate across those.
 */
export function useCustomerTimeline(customerId: ID | undefined) {
  const activityProvider = useActivityProvider();
  return useQuery({
    queryKey: ["customer-timeline", customerId],
    queryFn: () => activityProvider.getCustomerTimeline(customerId as ID),
    enabled: !!customerId,
  });
}
