import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useCustomersProvider } from "@/providers/data";

export interface IUsePendingContactsParams {
  storeId: ID | null;
  search: string;
  page: number;
  pageSize: number;
  /** Which tag bucket to load. Defaults to "pending_review". */
  statusTag?: "pending_review" | "reviewed_not_customer";
}

export function usePendingContacts(params: IUsePendingContactsParams) {
  const provider = useCustomersProvider();
  const statusTag = params.statusTag ?? "pending_review";
  return useQuery({
    queryKey: ["pending-contacts", params.storeId, params.search, params.page, params.pageSize, statusTag],
    queryFn: () =>
      provider.list({
        storeId: params.storeId ?? undefined,
        tags: [statusTag],
        search: params.search.trim() || undefined,
        page: params.page,
        pageSize: params.pageSize,
      }),
    enabled: Boolean(params.storeId),
    // Keep previous data while refetching (e.g. on search) so the list/count
    // don't blank on every keystroke — but ONLY within the same status bucket.
    // Crossing tabs (pending ↔ discarded) swaps the row set AND the action
    // buttons, so carrying the other tab's rows over would briefly render the
    // wrong actions (and a click would fire the wrong RPC). queryKey[5] = statusTag.
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[5] === statusTag ? prev : undefined,
  });
}
