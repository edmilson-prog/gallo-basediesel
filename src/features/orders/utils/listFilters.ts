import type { ID, OrderFulfillmentStatus, OrderPaymentStatus, OrderStatus } from "@/shared/types";

export type OrderDateRangeBucket = "any" | "24h" | "7d" | "30d" | "90d" | "custom";
export type OrderOriginFilterKind = "sdr" | "quote" | "manual" | "ecommerce" | "portal";

export interface IOrdersListFilters {
  statuses: OrderStatus[];
  paymentStatuses: OrderPaymentStatus[];
  fulfillmentStatuses: OrderFulfillmentStatus[];
  sellerIds: ID[];
  customerId?: ID;
  dateRange: OrderDateRangeBucket;
  /** Used when dateRange === "custom" — ISO yyyy-mm-dd. */
  dateFrom?: string;
  dateTo?: string;
  totalMin?: number;
  totalMax?: number;
  origins: OrderOriginFilterKind[];
  storeIds: ID[];
  search: string;
}

export const EMPTY_ORDER_FILTERS: IOrdersListFilters = {
  statuses: [],
  paymentStatuses: [],
  fulfillmentStatuses: [],
  sellerIds: [],
  customerId: undefined,
  dateRange: "any",
  dateFrom: undefined,
  dateTo: undefined,
  totalMin: undefined,
  totalMax: undefined,
  origins: [],
  storeIds: [],
  search: "",
};

export type OrderOrderBy = "createdAt" | "updatedAt" | "total";
export type OrderOrderDir = "asc" | "desc";

export interface IOrdersListSort {
  orderBy: OrderOrderBy;
  orderDir: OrderOrderDir;
}

export const ORDER_DEFAULT_SORT: IOrdersListSort = {
  orderBy: "createdAt",
  orderDir: "desc",
};

export const ORDER_PAGE_SIZES = [25, 50, 100] as const;
export type OrdersPageSize = (typeof ORDER_PAGE_SIZES)[number];
export const ORDER_DEFAULT_PAGE_SIZE: OrdersPageSize = 50;

export function activeOrderFilterCount(filters: IOrdersListFilters): number {
  let count = 0;
  if (filters.statuses.length > 0) count += 1;
  if (filters.paymentStatuses.length > 0) count += 1;
  if (filters.fulfillmentStatuses.length > 0) count += 1;
  if (filters.sellerIds.length > 0) count += 1;
  if (filters.customerId) count += 1;
  if (filters.dateRange !== "any") count += 1;
  if (filters.totalMin !== undefined || filters.totalMax !== undefined) count += 1;
  if (filters.origins.length > 0) count += 1;
  if (filters.storeIds.length > 0) count += 1;
  return count;
}

/** Resolve absolute ISO bounds from the date range filter. */
export function resolveOrderDateBounds(filters: IOrdersListFilters): {
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
  if (filters.dateRange === "90d") {
    return { createdAfter: new Date(now.getTime() - 90 * 86400_000).toISOString() };
  }
  if (filters.dateRange === "custom") {
    return {
      createdAfter: filters.dateFrom ? `${filters.dateFrom}T00:00:00.000Z` : undefined,
      createdBefore: filters.dateTo ? `${filters.dateTo}T23:59:59.999Z` : undefined,
    };
  }
  return {};
}
