import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { IVehicle } from "@/shared/types";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import {
  toListParams,
  type IVehiclesListFilters,
  type IVehiclesListSort,
  type PageSize,
} from "../utils/listFilters";

export interface IVehiclesListQuery {
  data: IVehicle[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
  invalidate: () => Promise<void>;
}

export function useVehiclesList(
  filters: IVehiclesListFilters,
  sort: IVehiclesListSort,
  page: number,
  pageSize: PageSize,
): IVehiclesListQuery {
  const provider = useVehiclesProvider();
  const queryClient = useQueryClient();
  const params = toListParams(filters, sort, page, pageSize);

  const query = useQuery({
    queryKey: ["vehicles-list", params] as const,
    queryFn: () => provider.list(params),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  return {
    data: query.data?.data ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: () => void query.refetch(),
    invalidate: () => queryClient.invalidateQueries({ queryKey: ["vehicles-list"] }),
  };
}
