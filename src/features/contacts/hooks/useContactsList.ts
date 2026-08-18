import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { IContact, IContactScopeCounts } from "@/shared/types";
import { useContactsProvider, type IListContactsParams } from "@/providers/data";

const EMPTY_COUNTS: IContactScopeCounts = { todos: 0, vinculados: 0, soltos: 0, optout: 0 };

export interface IContactsListQuery {
  data: IContact[];
  /** Server-reported total for the current filters — drives pagination. */
  total: number;
  counts: IContactScopeCounts;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
  invalidate: () => Promise<void>;
}

/**
 * Reads a page of the Agenda plus the four scope counts.
 *
 * The query key carries the whole param object, filters and page included —
 * without that, paging or filtering would keep showing the previous result
 * until the refetch resolved.
 *
 * `counts` is fetched separately and deliberately ignores the active scope, so
 * all four chips can show a number at once.
 */
export function useContactsList(params: IListContactsParams): IContactsListQuery {
  const provider = useContactsProvider();
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ["contacts-list", params] as const,
    queryFn: () => provider.list(params),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // Same filters, minus scope and paging: the chips describe the filtered set,
  // not the page the user happens to be on.
  const { scope: _scope, page: _page, pageSize: _pageSize, ...countParams } = params;

  const counts = useQuery({
    queryKey: ["contacts-counts", countParams] as const,
    queryFn: () => provider.counts(countParams),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  return {
    data: list.data?.data ?? [],
    total: list.data?.total ?? 0,
    counts: counts.data ?? EMPTY_COUNTS,
    isLoading: list.isLoading,
    isFetching: list.isFetching || counts.isFetching,
    isError: list.isError || counts.isError,
    refetch: () => void list.refetch(),
    invalidate: async () => {
      await queryClient.invalidateQueries({ queryKey: ["contacts-list"] });
      await queryClient.invalidateQueries({ queryKey: ["contacts-counts"] });
    },
  };
}
