import type { ID, IVehicle, VehicleCadastroStatus } from "@/shared/types";
import type { IListVehiclesParams, VehiclesOrderBy, VehiclesOrderDir } from "@/providers/data";

export { UNKNOWN_VEHICLE_BRAND, VEHICLE_BRANDS, type VehicleBrand } from "./vehicleBrands";

export const CADASTRO_STATUS_KEYS: VehicleCadastroStatus[] = ["aprovado", "pendente", "rejeitado"];

export const PAGE_SIZES = [25, 50, 100, 200] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 50;

export interface IVehiclesListFilters {
  brands: string[];
  model: string;
  engine: string;
  yearMin?: number;
  yearMax?: number;
  customerId?: ID;
  cadastroStatuses: VehicleCadastroStatus[];
  /** Enrichment queue: only vehicles with no odometer reading. */
  withoutKm: boolean;
  /** Enrichment queue: only vehicles with no canonical model linked. */
  withoutModel: boolean;
  storeIds: ID[];
  sellerIds: ID[];
  search: string;
}

export const EMPTY_FILTERS: IVehiclesListFilters = {
  brands: [],
  model: "",
  engine: "",
  cadastroStatuses: [],
  withoutKm: false,
  withoutModel: false,
  storeIds: [],
  sellerIds: [],
  search: "",
};

export interface IVehiclesListSort {
  orderBy: VehiclesOrderBy;
  orderDir: VehiclesOrderDir;
}

export const DEFAULT_SORT: IVehiclesListSort = { orderBy: "createdAt", orderDir: "desc" };

export function toListParams(
  filters: IVehiclesListFilters,
  sort: IVehiclesListSort,
  page: number,
  pageSize: number,
): IListVehiclesParams {
  return {
    page,
    pageSize,
    brands: filters.brands.length > 0 ? filters.brands : undefined,
    model: filters.model.trim() ? filters.model.trim() : undefined,
    engine: filters.engine.trim() ? filters.engine.trim() : undefined,
    yearMin: filters.yearMin,
    yearMax: filters.yearMax,
    customerId: filters.customerId,
    cadastroStatuses: filters.cadastroStatuses.length > 0 ? filters.cadastroStatuses : undefined,
    withoutKm: filters.withoutKm ? true : undefined,
    withoutModel: filters.withoutModel ? true : undefined,
    storeIds: filters.storeIds.length > 0 ? filters.storeIds : undefined,
    sellerIds: filters.sellerIds.length > 0 ? filters.sellerIds : undefined,
    search: filters.search.trim() ? filters.search.trim() : undefined,
    orderBy: sort.orderBy,
    orderDir: sort.orderDir,
  };
}

export function countActiveFilters(filters: IVehiclesListFilters): number {
  let n = 0;
  if (filters.brands.length > 0) n += 1;
  if (filters.model.trim()) n += 1;
  if (filters.engine.trim()) n += 1;
  if (filters.yearMin !== undefined || filters.yearMax !== undefined) n += 1;
  if (filters.customerId) n += 1;
  if (filters.cadastroStatuses.length > 0) n += 1;
  if (filters.withoutKm) n += 1;
  if (filters.withoutModel) n += 1;
  if (filters.storeIds.length > 0) n += 1;
  if (filters.sellerIds.length > 0) n += 1;
  return n;
}

export function filtersEqual(a: IVehiclesListFilters, b: IVehiclesListFilters): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function normalize(f: IVehiclesListFilters): IVehiclesListFilters {
  return {
    ...f,
    brands: [...f.brands].sort(),
    cadastroStatuses: [...f.cadastroStatuses].sort(),
    storeIds: [...f.storeIds].sort(),
    sellerIds: [...f.sellerIds].sort(),
  };
}

export function lastServiceAt(vehicle: IVehicle): string | null {
  if (vehicle.serviceHistory.length === 0) return null;
  return vehicle.serviceHistory.reduce(
    (acc, entry) => (entry.date.localeCompare(acc) > 0 ? entry.date : acc),
    vehicle.serviceHistory[0].date,
  );
}
