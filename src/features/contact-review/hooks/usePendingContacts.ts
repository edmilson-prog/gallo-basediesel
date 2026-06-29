import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useCustomersProvider } from "@/providers/data";

export interface IUsePendingContactsParams {
  storeId: ID | null;
  search: string;
  page: number;
  pageSize: number;
}

export function usePendingContacts(params: IUsePendingContactsParams) {
  const provider = useCustomersProvider();
  return useQuery({
    queryKey: ["pending-contacts", params.storeId, params.search, params.page, params.pageSize],
    queryFn: () =>
      provider.list({
        storeId: params.storeId ?? undefined,
        tags: ["pending_review"],
        search: params.search.trim() || undefined,
        page: params.page,
        pageSize: params.pageSize,
      }),
    enabled: Boolean(params.storeId),
  });
}
