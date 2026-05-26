import type { ID, QuoteOrigin, QuoteStatus } from "@/shared/types";

export type ValidityBucket = "any" | "expiring_soon" | "expired" | "valid";
export type DateRangeBucket = "any" | "24h" | "7d" | "30d" | "custom";

export interface IQuotesListFilters {
  statuses: QuoteStatus[];
  origins: QuoteOrigin[];
  sellerIds: ID[];
  customerId?: ID;
  dateRange: DateRangeBucket;
  /** Used when dateRange === "custom" — ISO yyyy-mm-dd. */
  dateFrom?: string;
  dateTo?: string;
  totalMin?: number;
  totalMax?: number;
  validity: ValidityBucket;
  storeIds: ID[];
  search: string;
}

export const EMPTY_FILTERS: IQuotesListFilters = {
  statuses: [],
  origins: [],
  sellerIds: [],
  customerId: undefined,
  dateRange: "any",
  dateFrom: undefined,
  dateTo: undefined,
  totalMin: undefined,
  totalMax: undefined,
  validity: "any",
  storeIds: [],
  search: "",
};

export type QuoteOrderBy = "createdAt" | "updatedAt" | "total" | "validUntil";
export type QuoteOrderDir = "asc" | "desc";

export interface IQuotesListSort {
  orderBy: QuoteOrderBy;
  orderDir: QuoteOrderDir;
}

export const DEFAULT_SORT: IQuotesListSort = { orderBy: "createdAt", orderDir: "desc" };

export const PAGE_SIZES = [25, 50, 100] as const;
export type QuotesPageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: QuotesPageSize = 50;

export function activeFilterCount(filters: IQuotesListFilters): number {
  let count = 0;
  if (filters.statuses.length > 0) count += 1;
  if (filters.origins.length > 0) count += 1;
  if (filters.sellerIds.length > 0) count += 1;
  if (filters.customerId) count += 1;
  if (filters.dateRange !== "any") count += 1;
  if (filters.totalMin !== undefined || filters.totalMax !== undefined) count += 1;
  if (filters.validity !== "any") count += 1;
  if (filters.storeIds.length > 0) count += 1;
  return count;
}

/** Resolve absolute ISO bounds from the date range filter. */
export function resolveDateBounds(filters: IQuotesListFilters): {
  createdAfter?: string;
  createdBefore?: string;
} {
  const now = new Date();
  if (filters.dateRange === "24h") {
    return { createdAfter: new Date(now.getTime() - 24 * 3600_000).toISOString() };
  }
  if (filters.dateRange === "7d") {
    return { createdAfter: new Date(now.getTime() - 7 * 86400_000).toISOString() };
  }
  if (filters.dateRange === "30d") {
    return { createdAfter: new Date(now.getTime() - 30 * 86400_000).toISOString() };
  }
  if (filters.dateRange === "custom") {
    return {
      createdAfter: filters.dateFrom ? `${filters.dateFrom}T00:00:00.000Z` : undefined,
      createdBefore: filters.dateTo ? `${filters.dateTo}T23:59:59.999Z` : undefined,
    };
  }
  return {};
}
