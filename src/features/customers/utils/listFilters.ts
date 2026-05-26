import type { CustomerStatus, ICustomer, ID } from "@/shared/types";
import type { IListCustomersParams, INumericRange, RecencyBucket } from "@/providers/data";

/** Vehicle brands selectable in the filter dropdown. */
export const VEHICLE_BRANDS = ["Volvo", "Scania", "Mercedes-Benz", "Ford", "Iveco"] as const;
export type VehicleBrandName = (typeof VEHICLE_BRANDS)[number];

/** ABC keys, including "none" for unclassified. */
export const ABC_KEYS = ["A", "B", "C", "none"] as const;
export type AbcKey = (typeof ABC_KEYS)[number];

/** Status keys with stable order matching the lifecycle. */
export const STATUS_KEYS: CustomerStatus[] = ["ativo", "dormente", "recuperacao", "perdido"];

export const RECENCY_BUCKETS: RecencyBucket[] = ["0-30", "31-90", "91-180", "180+"];

export const PAGE_SIZES = [25, 50, 100, 200] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 50;

/**
 * Strongly-typed filter state owned by the customers list page.
 *
 * Stored in URL query params (string-encoded) and translated to provider
 * params via {@link toListParams}.
 */
export interface ICustomersListFilters {
  statuses: CustomerStatus[];
  type: ICustomer["type"] | "all";
  abcClasses: AbcKey[];
  tags: string[];
  sellerIds: ID[];
  recencyBuckets: RecencyBucket[];
  recencyCustom?: { minDays?: number; maxDays?: number };
  ticketRange?: INumericRange;
  ltvRange?: INumericRange;
  vehicleBrands: (VehicleBrandName | "any")[];
  storeIds: ID[];
  search: string;
}

export const EMPTY_FILTERS: ICustomersListFilters = {
  statuses: [],
  type: "all",
  abcClasses: [],
  tags: [],
  sellerIds: [],
  recencyBuckets: [],
  vehicleBrands: [],
  storeIds: [],
  search: "",
};

export type CustomersOrderBy = NonNullable<IListCustomersParams["orderBy"]>;
export type CustomersOrderDir = NonNullable<IListCustomersParams["orderDir"]>;

export interface ICustomersListSort {
  orderBy: CustomersOrderBy;
  orderDir: CustomersOrderDir;
}

export const DEFAULT_SORT: ICustomersListSort = { orderBy: "name", orderDir: "asc" };

/** Translate page filters into provider-level params. */
export function toListParams(
  filters: ICustomersListFilters,
  sort: ICustomersListSort,
  page: number,
  pageSize: number,
): IListCustomersParams {
  return {
    page,
    pageSize,
    statuses: filters.statuses.length > 0 ? filters.statuses : undefined,
    type: filters.type === "all" ? undefined : filters.type,
    abcClasses: filters.abcClasses.length > 0 ? filters.abcClasses : undefined,
    tags: filters.tags.length > 0 ? filters.tags : undefined,
    sellerIds: filters.sellerIds.length > 0 ? filters.sellerIds : undefined,
    recencyBuckets: filters.recencyBuckets.length > 0 ? filters.recencyBuckets : undefined,
    recencyCustom: filters.recencyCustom,
    ticketRange: filters.ticketRange,
    ltvRange: filters.ltvRange,
    vehicleBrands: filters.vehicleBrands.length > 0 ? filters.vehicleBrands : undefined,
    storeIds: filters.storeIds.length > 0 ? filters.storeIds : undefined,
    search: filters.search?.trim() ? filters.search.trim() : undefined,
    orderBy: sort.orderBy,
    orderDir: sort.orderDir,
  };
}

/** Count of "active" filters (non-empty groups), excluding search. */
export function countActiveFilters(filters: ICustomersListFilters): number {
  let n = 0;
  if (filters.statuses.length > 0) n += 1;
  if (filters.type !== "all") n += 1;
  if (filters.abcClasses.length > 0) n += 1;
  if (filters.tags.length > 0) n += 1;
  if (filters.sellerIds.length > 0) n += 1;
  if (filters.recencyBuckets.length > 0 || filters.recencyCustom) n += 1;
  if (filters.ticketRange && (filters.ticketRange.min || filters.ticketRange.max)) n += 1;
  if (filters.ltvRange && (filters.ltvRange.min || filters.ltvRange.max)) n += 1;
  if (filters.vehicleBrands.length > 0) n += 1;
  if (filters.storeIds.length > 0) n += 1;
  return n;
}

/** Stable deep-equality enough for filter comparison (no Dates / cycles). */
export function filtersEqual(a: ICustomersListFilters, b: ICustomersListFilters): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function normalize(f: ICustomersListFilters): ICustomersListFilters {
  return {
    ...f,
    statuses: [...f.statuses].sort(),
    abcClasses: [...f.abcClasses].sort(),
    tags: [...f.tags].sort(),
    sellerIds: [...f.sellerIds].sort(),
    recencyBuckets: [...f.recencyBuckets].sort(),
    vehicleBrands: [...f.vehicleBrands].sort(),
    storeIds: [...f.storeIds].sort(),
  };
}
