import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useActivityProvider } from "@/providers/data";

/**
 * Fetches a customer's full attendance-activity feed (across every
 * conversation) for the AttendanceHistoryPanel.
 *
 * Isolated query key — `["customer-activity", customerId]` — deliberately
 * distinct from the frozen conversation/message cache keys (signing lote
 * #137, Realtime, gated-once RPCs). Never share or invalidate across those.
 */
export function useCustomerActivity(customerId: ID | undefined) {
  const activityProvider = useActivityProvider();
  return useQuery({
    queryKey: ["customer-activity", customerId],
    queryFn: () => activityProvider.getCustomerActivity(customerId as ID),
    enabled: !!customerId,
  });
}
