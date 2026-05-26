import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ID, IQuote } from "@/shared/types";
import { useQuotesProvider } from "@/providers/data/hooks/useQuotesProvider";
import {
  resolveDateBounds,
  type IQuotesListFilters,
  type IQuotesListSort,
  type QuotesPageSize,
} from "../utils/listFilters";
import { validityBucket } from "../utils/quoteTotals";

export interface IQuotesListQuery {
  data: IQuote[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
  invalidate: () => Promise<void>;
}

function applyClientFilters(quotes: IQuote[], filters: IQuotesListFilters): IQuote[] {
  return quotes.filter((q) => {
    if (filters.totalMin !== undefined && q.total < filters.totalMin) return false;
    if (filters.totalMax !== undefined && q.total > filters.totalMax) return false;
    if (filters.storeIds.length > 0 && !filters.storeIds.includes(q.storeId)) return false;
    if (filters.validity !== "any") {
      const bucket = validityBucket(q.validUntil);
      if (filters.validity === "expired" && bucket !== "expired") return false;
      if (filters.validity === "expiring_soon" && bucket !== "critical" && bucket !== "warning") {
        return false;
      }
      if (filters.validity === "valid" && bucket === "expired") return false;
    }
    return true;
  });
}

/**
 * Paginated quote list with provider-side primary filters and client-side
 * filtering for criteria not expressible via the provider (validity bucket,
 * total range, multi-store).
 */
export function useQuotesList(
  filters: IQuotesListFilters,
  sort: IQuotesListSort,
  page: number,
  pageSize: QuotesPageSize,
  options: { sellerIdLock?: ID | null } = {},
): IQuotesListQuery {
  const provider = useQuotesProvider();
  const queryClient = useQueryClient();

  const params = useMemo(() => {
    const bounds = resolveDateBounds(filters);
    return {
      storeId: filters.storeIds.length === 1 ? filters.storeIds[0] : undefined,
      sellerId: options.sellerIdLock ?? undefined,
      status: filters.statuses.length > 0 ? filters.statuses : undefined,
      origin: filters.origins.length > 0 ? filters.origins : undefined,
      customerId: filters.customerId,
      createdAfter: bounds.createdAfter,
      createdBefore: bounds.createdBefore,
      search: filters.search?.trim() ? filters.search.trim() : undefined,
      orderBy: sort.orderBy,
      orderDir: sort.orderDir,
      page: 1,
      pageSize: 1000,
    };
  }, [filters, sort, options.sellerIdLock]);

  const query = useQuery({
    queryKey: ["quotes-list", params] as const,
    queryFn: () => provider.list(params),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const result = useMemo(() => {
    const fetched = query.data?.data ?? [];
    let filtered = applyClientFilters(fetched, filters);
    if (options.sellerIdLock && filters.sellerIds.length === 0) {
      filtered = filtered.filter((q) => q.sellerId === options.sellerIdLock);
    } else if (filters.sellerIds.length > 0) {
      const set = new Set(filters.sellerIds);
      filtered = filtered.filter((q) => set.has(q.sellerId));
    }
    const start = (page - 1) * pageSize;
    return { paged: filtered.slice(start, start + pageSize), total: filtered.length };
  }, [query.data, filters, page, pageSize, options.sellerIdLock]);

  return {
    data: result.paged,
    total: result.total,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: () => void query.refetch(),
    invalidate: () => queryClient.invalidateQueries({ queryKey: ["quotes-list"] }),
  };
}

export function useQuote(id: ID | undefined) {
  const provider = useQuotesProvider();
  return useQuery({
    queryKey: ["quote", id] as const,
    queryFn: () => provider.get(id as ID),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}
