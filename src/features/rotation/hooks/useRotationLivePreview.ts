import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IRotationQueueState, ISeller } from "@/shared/types";
import { useSellersProvider } from "@/providers/data";
import { selectNextFromRotation } from "../engine/selectNextFromRotation";

/**
 * Runs the pure selection engine against the current queue state + live seller
 * presence to power the "who's next" view. Uses ALL sellers (not active-only)
 * so offline/inactive participants still resolve to a name and a skip reason.
 * Distinct query key from the manager's active-only sellers query.
 */
export function useRotationLivePreview(storeId: string, state: IRotationQueueState | undefined) {
  const sellersProvider = useSellersProvider();
  const sellersQuery = useQuery({
    queryKey: ["rotation-preview-sellers", storeId],
    queryFn: () => sellersProvider.list({ storeId }),
    enabled: Boolean(storeId),
  });

  return useMemo(() => {
    if (!state) return null;
    const sellers = sellersQuery.data ?? [];
    const sellersById: Record<string, ISeller> = Object.fromEntries(sellers.map((s) => [s.id, s]));
    const result = selectNextFromRotation({
      queue: state.queue,
      participants: state.topParticipants,
      membersByDepartment: state.membersByDepartment,
      sellersById,
      now: new Date(),
    });
    return { result, sellersById };
  }, [state, sellersQuery.data]);
}
