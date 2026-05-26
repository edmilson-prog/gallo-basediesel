import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ICustomer } from "@/shared/types";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import type { ICustomersListFilters, ICustomersListSort, PageSize } from "../utils/listFilters";
import { toListParams } from "../utils/listFilters";

export interface ICustomersListQuery {
  data: ICustomer[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
  invalidate: () => Promise<void>;
}

export function useCustomersList(
  filters: ICustomersListFilters,
  sort: ICustomersListSort,
  page: number,
  pageSize: PageSize,
): ICustomersListQuery {
  const provider = useCustomersProvider();
  const queryClient = useQueryClient();
  const params = toListParams(filters, sort, page, pageSize);

  const query = useQuery({
    queryKey: ["customers-list", params] as const,
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
    invalidate: () => queryClient.invalidateQueries({ queryKey: ["customers-list"] }),
  };
}
