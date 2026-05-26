import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ID, IVehicle } from "@/shared/types";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";

export interface IVehicleDetailQuery {
  vehicle: IVehicle | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  invalidate: () => Promise<void>;
}

export function useVehicleDetail(id: ID): IVehicleDetailQuery {
  const provider = useVehiclesProvider();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["vehicle-detail", id] as const,
    queryFn: () => provider.get(id),
    staleTime: 30_000,
  });
  return {
    vehicle: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
    invalidate: () => queryClient.invalidateQueries({ queryKey: ["vehicle-detail", id] }),
  };
}
