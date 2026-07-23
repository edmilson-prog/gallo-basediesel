import type { ID, PartCategory } from "@/shared/types";
import type { IListPartsParams } from "@/providers/data/contracts/parts";

export type StockBucket = "any" | "in_stock" | "low" | "zero";
export type StatusBucket = "any" | "active" | "inactive";
export type OriginBucket = "any" | "original" | "equivalent";

export interface ICatalogListFilters {
  categories: PartCategory[];
  subcategory?: string;
  manufacturers: string[];
  origin: OriginBucket;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  priceMin?: number;
  priceMax?: number;
  stock: StockBucket;
  status: StatusBucket;
  storeIds: ID[];
  search: string;
}

export const EMPTY_FILTERS: ICatalogListFilters = {
  categories: [],
  subcategory: undefined,
  manufacturers: [],
  origin: "any",
  vehicleBrand: undefined,
  vehicleModel: undefined,
  vehicleYear: undefined,
  priceMin: undefined,
  priceMax: undefined,
  stock: "any",
  status: "active",
  storeIds: [],
  search: "",
};

export type CatalogOrderBy =
  | "name"
  | "oem"
  | "category"
  | "manufacturer"
  | "applications"
  | "unitPrice"
  | "stockAvailable"
  | "status";
export type CatalogOrderDir = "asc" | "desc";

/** Order fields the parts provider can sort natively; others are sorted client-side.
 *  NOTE: useCatalogList strips orderBy/orderDir before its full-window fetch
 *  (sortParts re-sorts locally and a sort-free params object keeps the queryKey
 *  stable) — these only matter for consumers that paginate server-side. */
const PROVIDER_ORDER_BY = new Set<CatalogOrderBy>(["name", "unitPrice", "stockAvailable"]);

export interface ICatalogListSort {
  orderBy: CatalogOrderBy;
  orderDir: CatalogOrderDir;
}

export const DEFAULT_SORT: ICatalogListSort = { orderBy: "name", orderDir: "asc" };

export const PAGE_SIZES = [25, 50, 100] as const;
export type CatalogPageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: CatalogPageSize = 50;

/** Build the params consumed by the parts provider. */
export function toListParams(
  filters: ICatalogListFilters,
  sort: ICatalogListSort,
  page: number,
  pageSize: CatalogPageSize,
): IListPartsParams {
  const params: IListPartsParams = {
    search: filters.search?.trim() ? filters.search.trim() : undefined,
    page,
    pageSize,
  };
  if (PROVIDER_ORDER_BY.has(sort.orderBy)) {
    params.orderBy = sort.orderBy as IListPartsParams["orderBy"];
    params.orderDir = sort.orderDir;
  }
  if (filters.status === "active") params.active = true;
  else if (filters.status === "inactive") params.active = false;
  if (filters.stock === "in_stock") params.inStock = true;
  return params;
}

export function activeFilterCount(filters: ICatalogListFilters): number {
  let count = 0;
  if (filters.categories.length > 0) count += 1;
  if (filters.subcategory) count += 1;
  if (filters.manufacturers.length > 0) count += 1;
  if (filters.origin !== "any") count += 1;
  if (filters.vehicleBrand || filters.vehicleModel || filters.vehicleYear !== undefined) count += 1;
  if (filters.priceMin !== undefined || filters.priceMax !== undefined) count += 1;
  if (filters.stock !== "any") count += 1;
  if (filters.status !== "active") count += 1;
  if (filters.storeIds.length > 0) count += 1;
  return count;
}
