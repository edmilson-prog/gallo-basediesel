import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ICustomer, ID, IQuote, ISeller } from "@/shared/types";
import { useQuotesProvider } from "@/providers/data/hooks/useQuotesProvider";
import {
  PROVIDER_ORDER_BY,
  resolveDateBounds,
  type IQuotesListFilters,
  type IQuotesListSort,
  type QuotesPageSize,
} from "../utils/listFilters";
import { validityBucket } from "../utils/quoteTotals";

export interface IQuotesListQuery {
  data: IQuote[];
  /** Full filtered set BEFORE the status filter and pagination — feeds KPIs/tabs. */
  allFiltered: IQuote[];
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

function quoteCustomerName(q: IQuote, customersById?: Map<ID, ICustomer>): string {
  const c = q.customerId ? customersById?.get(q.customerId) : undefined;
  if (!c) return "";
  return c.type === "B2B" ? c.nomeFantasia || c.razaoSocial : c.fullName;
}

function quoteSellerName(q: IQuote, sellersById?: Map<ID, ISeller>): string {
  return sellersById?.get(q.sellerId)?.fullName ?? (q.sellerId === "sdr-agent" ? "Agente SDR" : "");
}

/** Sort quotes by any column — covers fields the provider cannot sort natively. */
function sortQuotes(
  quotes: IQuote[],
  sort: IQuotesListSort,
  customersById?: Map<ID, ICustomer>,
  sellersById?: Map<ID, ISeller>,
): IQuote[] {
  const dir = sort.orderDir === "desc" ? -1 : 1;
  const cmpStr = (a: string, b: string) => a.localeCompare(b, "pt-BR") * dir;
  return [...quotes].sort((a, b) => {
    switch (sort.orderBy) {
      case "number":
        return cmpStr(a.number, b.number);
      case "customer":
        return cmpStr(quoteCustomerName(a, customersById), quoteCustomerName(b, customersById));
      case "origin":
        return cmpStr(a.origin, b.origin);
      case "seller":
        return cmpStr(quoteSellerName(a, sellersById), quoteSellerName(b, sellersById));
      case "status":
        return cmpStr(a.status, b.status);
      case "total":
        return (a.total - b.total) * dir;
      case "validUntil":
        return cmpStr(a.validUntil ?? "", b.validUntil ?? "");
      case "updatedAt":
        return cmpStr(a.updatedAt ?? "", b.updatedAt ?? "");
      case "createdAt":
      default:
        return cmpStr(a.createdAt, b.createdAt);
    }
  });
}

/**
 * Paginated quote list with provider-side primary filters and client-side
 * filtering for criteria not expressible via the provider (validity bucket,
 * total range, multi-store) plus client-side sorting across all columns.
 */
export function useQuotesList(
  filters: IQuotesListFilters,
  sort: IQuotesListSort,
  page: number,
  pageSize: QuotesPageSize,
  options: {
    sellerIdLock?: ID | null;
    customersById?: Map<ID, ICustomer>;
    sellersById?: Map<ID, ISeller>;
  } = {},
): IQuotesListQuery {
  const provider = useQuotesProvider();
  const queryClient = useQueryClient();

  const params = useMemo(() => {
    const bounds = resolveDateBounds(filters);
    return {
      storeId: filters.storeIds.length === 1 ? filters.storeIds[0] : undefined,
      sellerId: options.sellerIdLock ?? undefined,
      origin: filters.origins.length > 0 ? filters.origins : undefined,
      customerId: filters.customerId,
      createdAfter: bounds.createdAfter,
      createdBefore: bounds.createdBefore,
      search: filters.search?.trim() ? filters.search.trim() : undefined,
      orderBy: PROVIDER_ORDER_BY.has(sort.orderBy)
        ? (sort.orderBy as "createdAt" | "updatedAt" | "total" | "validUntil")
        : undefined,
      orderDir: PROVIDER_ORDER_BY.has(sort.orderBy) ? sort.orderDir : undefined,
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
    // allFiltered = todos os filtros comuns + vendedor, MAS sem status nem paginação.
    let allFiltered = applyClientFilters(fetched, filters);
    if (options.sellerIdLock && filters.sellerIds.length === 0) {
      allFiltered = allFiltered.filter((q) => q.sellerId === options.sellerIdLock);
    } else if (filters.sellerIds.length > 0) {
      const set = new Set(filters.sellerIds);
      allFiltered = allFiltered.filter((q) => set.has(q.sellerId));
    }
    // afterStatus aplica o filtro de status (agora client-side) sobre allFiltered.
    const statusSet = new Set(filters.statuses);
    const afterStatus =
      statusSet.size > 0 ? allFiltered.filter((q) => statusSet.has(q.status)) : allFiltered;
    const sorted = sortQuotes(afterStatus, sort, options.customersById, options.sellersById);
    const start = (page - 1) * pageSize;
    return {
      paged: sorted.slice(start, start + pageSize),
      total: sorted.length,
      allFiltered,
    };
  }, [
    query.data,
    filters,
    sort,
    page,
    pageSize,
    options.sellerIdLock,
    options.customersById,
    options.sellersById,
  ]);

  return {
    data: result.paged,
    allFiltered: result.allFiltered,
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
