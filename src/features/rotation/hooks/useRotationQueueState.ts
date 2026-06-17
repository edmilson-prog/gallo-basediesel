import { useQuery } from "@tanstack/react-query";
import { useRotationQueuesProvider } from "@/providers/data";

/** Reads the store's rotation queue state (queue + participants) via the provider. */
export function useRotationQueueState(storeId: string) {
  const provider = useRotationQueuesProvider();
  return useQuery({
    queryKey: ["rotation-queue-state", storeId],
    queryFn: () => provider.getState(storeId),
    enabled: Boolean(storeId),
  });
}
