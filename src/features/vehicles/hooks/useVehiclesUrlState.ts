import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ID, VehicleCadastroStatus } from "@/shared/types";
import type { VehiclesOrderBy, VehiclesOrderDir } from "@/providers/data";
import { usePersistedListSearch } from "@/shared/hooks/usePersistedListSearch";
import {
  CADASTRO_STATUS_KEYS,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  EMPTY_FILTERS,
  PAGE_SIZES,
  type IVehiclesListFilters,
  type IVehiclesListSort,
  type PageSize,
} from "../utils/listFilters";

export interface IVehiclesListSearch {
  brands?: string;
  model?: string;
  engine?: string;
  yearMin?: number;
  yearMax?: number;
  customer?: string;
  status?: string;
  /** Enrichment-queue chips — present as "1" when on, absent when off. */
  semKm?: string;
  semModelo?: string;
  stores?: string;
  sellers?: string;
  q?: string;
  orderBy?: string;
  orderDir?: string;
  page?: number;
  pageSize?: number;
}

const VALID_ORDER_BY = new Set<VehiclesOrderBy>([
  "brand",
  "engine",
  "plate",
  "seller",
  "cadastroStatus",
  "createdAt",
  "lastServiceAt",
  "currentKm",
  "year",
  "customerName",
]);
const VALID_ORDER_DIR = new Set<VehiclesOrderDir>(["asc", "desc"]);

const LIST_SEARCH_STORAGE_KEY = "gallo-vehicles-list-search";
const VALID_STATUS = new Set<VehicleCadastroStatus>(CADASTRO_STATUS_KEYS);

function numberOrUndefined(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function validateVehiclesSearch(raw: Record<string, unknown>): IVehiclesListSearch {
  const out: IVehiclesListSearch = {};
  if (typeof raw.brands === "string" && raw.brands.length > 0) out.brands = raw.brands;
  if (typeof raw.model === "string" && raw.model.length > 0) out.model = raw.model;
  if (typeof raw.engine === "string" && raw.engine.length > 0) out.engine = raw.engine;
  const yMin = numberOrUndefined(raw.yearMin);
  if (yMin !== undefined) out.yearMin = yMin;
  const yMax = numberOrUndefined(raw.yearMax);
  if (yMax !== undefined) out.yearMax = yMax;
  if (typeof raw.customer === "string" && raw.customer.length > 0) out.customer = raw.customer;
  if (typeof raw.status === "string" && raw.status.length > 0) out.status = raw.status;
  if (raw.semKm === "1" || raw.semKm === true) out.semKm = "1";
  if (raw.semModelo === "1" || raw.semModelo === true) out.semModelo = "1";
  if (typeof raw.stores === "string" && raw.stores.length > 0) out.stores = raw.stores;
  if (typeof raw.sellers === "string" && raw.sellers.length > 0) out.sellers = raw.sellers;
  if (typeof raw.q === "string" && raw.q.length > 0) out.q = raw.q;
  if (typeof raw.orderBy === "string") out.orderBy = raw.orderBy;
  if (typeof raw.orderDir === "string") out.orderDir = raw.orderDir;
  const p = numberOrUndefined(raw.page);
  if (p !== undefined) out.page = p;
  const ps = numberOrUndefined(raw.pageSize);
  if (ps !== undefined) out.pageSize = ps;
  return out;
}

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinCsv(values: string[] | undefined): string | undefined {
  if (!values || values.length === 0) return undefined;
  return values.join(",");
}

/**
 * Brands are NOT validated against a closed list. The `brand` column is free
 * text fed by imports, so a whitelist here would silently discard a valid
 * `?brands=Volkswagen` deep link — which is exactly what it used to do for
 * ~48% of the fleet. Unknown values simply match nothing downstream
 * (`.in("brand", …)`), which is the honest outcome.
 */
function parseBrands(raw: string | undefined): string[] {
  return splitCsv(raw);
}

function parseStatuses(raw: string | undefined): VehicleCadastroStatus[] {
  return splitCsv(raw).filter((s): s is VehicleCadastroStatus =>
    VALID_STATUS.has(s as VehicleCadastroStatus),
  );
}

function readFilters(search: IVehiclesListSearch): IVehiclesListFilters {
  return {
    brands: parseBrands(search.brands),
    model: search.model ?? "",
    engine: search.engine ?? "",
    yearMin: search.yearMin,
    yearMax: search.yearMax,
    customerId: search.customer,
    cadastroStatuses: parseStatuses(search.status),
    withoutKm: search.semKm === "1",
    withoutModel: search.semModelo === "1",
    storeIds: splitCsv(search.stores),
    sellerIds: splitCsv(search.sellers),
    search: search.q ?? "",
  };
}

function readSort(search: IVehiclesListSearch): IVehiclesListSort {
  const orderBy =
    search.orderBy && VALID_ORDER_BY.has(search.orderBy as VehiclesOrderBy)
      ? (search.orderBy as VehiclesOrderBy)
      : DEFAULT_SORT.orderBy;
  const orderDir =
    search.orderDir && VALID_ORDER_DIR.has(search.orderDir as VehiclesOrderDir)
      ? (search.orderDir as VehiclesOrderDir)
      : DEFAULT_SORT.orderDir;
  return { orderBy, orderDir };
}

function readPage(search: IVehiclesListSearch): { page: number; pageSize: PageSize } {
  const rawPageSize = search.pageSize ?? DEFAULT_PAGE_SIZE;
  const pageSize = (PAGE_SIZES as readonly number[]).includes(rawPageSize)
    ? (rawPageSize as PageSize)
    : DEFAULT_PAGE_SIZE;
  return { page: Math.max(1, Math.floor(search.page ?? 1)), pageSize };
}

export interface IVehiclesUrlState {
  filters: IVehiclesListFilters;
  sort: IVehiclesListSort;
  page: number;
  pageSize: PageSize;
  setFilters: (next: IVehiclesListFilters) => void;
  patchFilters: (patch: Partial<IVehiclesListFilters>) => void;
  setSort: (next: IVehiclesListSort) => void;
  setPage: (page: number) => void;
  setPageSize: (size: PageSize) => void;
  setSearch: (q: string) => void;
  clearAll: () => void;
}

export function useVehiclesUrlState(): IVehiclesUrlState {
  const search = useSearch({ from: "/app/veiculos/" }) as IVehiclesListSearch;
  const navigate = useNavigate({ from: "/app/veiculos/" });

  const filters = useMemo(() => readFilters(search), [search]);
  const sort = useMemo(() => readSort(search), [search]);
  const { page, pageSize } = useMemo(() => readPage(search), [search]);

  usePersistedListSearch(LIST_SEARCH_STORAGE_KEY, search as Record<string, unknown>, (saved) => {
    void navigate({ search: () => saved as unknown as IVehiclesListSearch, replace: true });
  });

  const apply = useCallback(
    (patch: Partial<IVehiclesListSearch>) => {
      void navigate({
        search: (prev) => {
          const next = { ...(prev as IVehiclesListSearch), ...patch };
          for (const key of Object.keys(next) as (keyof IVehiclesListSearch)[]) {
            const value = next[key];
            if (value === undefined || value === "" || value === null) delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  const writeFilters = useCallback(
    (f: IVehiclesListFilters) => {
      apply({
        brands: joinCsv(f.brands),
        model: f.model.trim() ? f.model.trim() : undefined,
        engine: f.engine.trim() ? f.engine.trim() : undefined,
        yearMin: f.yearMin,
        yearMax: f.yearMax,
        customer: f.customerId ?? undefined,
        status: joinCsv(f.cadastroStatuses),
        semKm: f.withoutKm ? "1" : undefined,
        semModelo: f.withoutModel ? "1" : undefined,
        stores: joinCsv(f.storeIds),
        sellers: joinCsv(f.sellerIds),
        q: f.search?.trim() ? f.search.trim() : undefined,
        page: undefined,
      });
    },
    [apply],
  );

  return {
    filters,
    sort,
    page,
    pageSize,
    setFilters: writeFilters,
    patchFilters: (patch) => writeFilters({ ...filters, ...patch }),
    setSort: (next) =>
      apply({
        orderBy: next.orderBy === DEFAULT_SORT.orderBy ? undefined : next.orderBy,
        orderDir: next.orderDir === DEFAULT_SORT.orderDir ? undefined : next.orderDir,
      }),
    setPage: (p) => apply({ page: p <= 1 ? undefined : p }),
    setPageSize: (size) =>
      apply({ pageSize: size === DEFAULT_PAGE_SIZE ? undefined : size, page: undefined }),
    setSearch: (q) => apply({ q: q.length === 0 ? undefined : q, page: undefined }),
    clearAll: () =>
      apply({
        brands: undefined,
        model: undefined,
        engine: undefined,
        yearMin: undefined,
        yearMax: undefined,
        customer: undefined,
        status: undefined,
        semKm: undefined,
        semModelo: undefined,
        stores: undefined,
        sellers: undefined,
        q: undefined,
        page: undefined,
      }),
  };
}

export { EMPTY_FILTERS };
