import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { usePersistedListSearch } from "@/shared/hooks/usePersistedListSearch";
import { isCategorySlug } from "@/features/catalog/utils/categories";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  DEFAULT_VIEW,
  EMPTY_FILTERS,
  isCatalogView,
  PAGE_SIZES,
  type CatalogOrderBy,
  type CatalogOrderDir,
  type CatalogPageSize,
  type CatalogView,
  type ICatalogListFilters,
  type ICatalogListSort,
  type OriginBucket,
  type StatusBucket,
  type StockBucket,
} from "../utils/listFilters";
import { DEFAULT_COVERAGE, isCoverageBucket, type CoverageBucket } from "../utils/completeness";

const VALID_STOCK = new Set<StockBucket>(["any", "in_stock", "low", "zero", "restock"]);
const VALID_STATUS = new Set<StatusBucket>(["any", "active", "inactive"]);
const VALID_ORIGIN = new Set<OriginBucket>(["any", "original", "equivalent"]);
const VALID_ORDER_BY = new Set<CatalogOrderBy>([
  "name",
  "oem",
  "category",
  "ficha",
  "manufacturer",
  "applications",
  "unitPrice",
  "margin",
  "turnover",
  "stockAvailable",
  "status",
]);
const VALID_ORDER_DIR = new Set<CatalogOrderDir>(["asc", "desc"]);

const LIST_SEARCH_STORAGE_KEY = "gallo-catalog-list-search";

export interface ICatalogListSearch {
  cats?: string;
  sub?: string;
  mans?: string;
  origin?: string;
  vbrand?: string;
  vmodel?: string;
  vyear?: number;
  pmin?: number;
  pmax?: number;
  stock?: string;
  status?: string;
  stores?: string;
  q?: string;
  /** Completeness bucket from the coverage strip. */
  cov?: string;
  /** Flat table or grouped by category. */
  view?: string;
  orderBy?: string;
  orderDir?: string;
  page?: number;
  pageSize?: number;
}

function numberOrUndefined(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function validateCatalogSearch(raw: Record<string, unknown>): ICatalogListSearch {
  const out: ICatalogListSearch = {};
  const passString = (key: keyof ICatalogListSearch) => {
    const value = raw[key];
    if (typeof value === "string" && value.length > 0) (out[key] as string) = value;
  };
  passString("cats");
  passString("sub");
  passString("mans");
  passString("origin");
  passString("vbrand");
  passString("vmodel");
  const vy = numberOrUndefined(raw.vyear);
  if (vy !== undefined) out.vyear = vy;
  const pmin = numberOrUndefined(raw.pmin);
  if (pmin !== undefined) out.pmin = pmin;
  const pmax = numberOrUndefined(raw.pmax);
  if (pmax !== undefined) out.pmax = pmax;
  passString("stock");
  passString("status");
  passString("stores");
  passString("q");
  passString("cov");
  passString("view");
  passString("orderBy");
  passString("orderDir");
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

function readFilters(search: ICatalogListSearch): ICatalogListFilters {
  const categories = splitCsv(search.cats).filter(isCategorySlug);
  const status = (
    search.status && VALID_STATUS.has(search.status as StatusBucket) ? search.status : "active"
  ) as StatusBucket;
  const stock = (
    search.stock && VALID_STOCK.has(search.stock as StockBucket) ? search.stock : "any"
  ) as StockBucket;
  const origin = (
    search.origin && VALID_ORIGIN.has(search.origin as OriginBucket) ? search.origin : "any"
  ) as OriginBucket;
  return {
    categories,
    subcategory: search.sub ?? undefined,
    manufacturers: splitCsv(search.mans),
    origin,
    vehicleBrand: search.vbrand ?? undefined,
    vehicleModel: search.vmodel ?? undefined,
    vehicleYear: search.vyear,
    priceMin: search.pmin,
    priceMax: search.pmax,
    stock,
    status,
    storeIds: splitCsv(search.stores),
    search: search.q ?? "",
    coverage: isCoverageBucket(search.cov) ? search.cov : DEFAULT_COVERAGE,
  };
}

function readView(search: ICatalogListSearch): CatalogView {
  return isCatalogView(search.view) ? search.view : DEFAULT_VIEW;
}

function readSort(search: ICatalogListSearch): ICatalogListSort {
  const orderBy =
    search.orderBy && VALID_ORDER_BY.has(search.orderBy as CatalogOrderBy)
      ? (search.orderBy as CatalogOrderBy)
      : DEFAULT_SORT.orderBy;
  const orderDir =
    search.orderDir && VALID_ORDER_DIR.has(search.orderDir as CatalogOrderDir)
      ? (search.orderDir as CatalogOrderDir)
      : DEFAULT_SORT.orderDir;
  return { orderBy, orderDir };
}

function readPage(search: ICatalogListSearch): { page: number; pageSize: CatalogPageSize } {
  const rawPageSize = search.pageSize ?? DEFAULT_PAGE_SIZE;
  const pageSize = (PAGE_SIZES as readonly number[]).includes(rawPageSize)
    ? (rawPageSize as CatalogPageSize)
    : DEFAULT_PAGE_SIZE;
  return { page: Math.max(1, Math.floor(search.page ?? 1)), pageSize };
}

export interface ICatalogUrlState {
  filters: ICatalogListFilters;
  sort: ICatalogListSort;
  view: CatalogView;
  page: number;
  pageSize: CatalogPageSize;
  patchFilters: (patch: Partial<ICatalogListFilters>) => void;
  setSort: (sort: ICatalogListSort) => void;
  setView: (view: CatalogView) => void;
  setCoverage: (coverage: CoverageBucket) => void;
  /**
   * View and coverage in a single navigation. Two consecutive setters would
   * both read the same `prev` search object and the last one would win, so the
   * triage shortcut has to write them together.
   */
  setViewAndCoverage: (view: CatalogView, coverage: CoverageBucket) => void;
  setPage: (page: number) => void;
  setPageSize: (size: CatalogPageSize) => void;
  setSearch: (q: string) => void;
  clearAll: () => void;
}

export function useCatalogUrlState(): ICatalogUrlState {
  const search = useSearch({ from: "/app/catalogo/" }) as ICatalogListSearch;
  const navigate = useNavigate({ from: "/app/catalogo/" });

  const filters = useMemo(() => readFilters(search), [search]);
  const sort = useMemo(() => readSort(search), [search]);
  const view = useMemo(() => readView(search), [search]);
  const { page, pageSize } = useMemo(() => readPage(search), [search]);

  usePersistedListSearch(LIST_SEARCH_STORAGE_KEY, search as Record<string, unknown>, (saved) => {
    void navigate({ search: () => saved as unknown as ICatalogListSearch, replace: true });
  });

  const apply = useCallback(
    (patch: Partial<ICatalogListSearch>) => {
      void navigate({
        search: (prev: unknown) => {
          const next = { ...(prev as ICatalogListSearch), ...patch };
          for (const key of Object.keys(next) as (keyof ICatalogListSearch)[]) {
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
    (f: ICatalogListFilters) => {
      apply({
        cats: joinCsv(f.categories),
        sub: f.subcategory,
        mans: joinCsv(f.manufacturers),
        origin: f.origin === "any" ? undefined : f.origin,
        vbrand: f.vehicleBrand,
        vmodel: f.vehicleModel,
        vyear: f.vehicleYear,
        pmin: f.priceMin,
        pmax: f.priceMax,
        stock: f.stock === "any" ? undefined : f.stock,
        status: f.status === "active" ? undefined : f.status,
        stores: joinCsv(f.storeIds),
        q: f.search?.trim() ? f.search.trim() : undefined,
        cov: f.coverage === DEFAULT_COVERAGE ? undefined : f.coverage,
        page: undefined,
      });
    },
    [apply],
  );

  return {
    filters,
    sort,
    view,
    page,
    pageSize,
    patchFilters: (patch) => writeFilters({ ...filters, ...patch }),
    setSort: (next) =>
      apply({
        orderBy: next.orderBy === DEFAULT_SORT.orderBy ? undefined : next.orderBy,
        orderDir: next.orderDir === DEFAULT_SORT.orderDir ? undefined : next.orderDir,
      }),
    setView: (next) => apply({ view: next === DEFAULT_VIEW ? undefined : next }),
    setCoverage: (next) =>
      apply({ cov: next === DEFAULT_COVERAGE ? undefined : next, page: undefined }),
    setViewAndCoverage: (nextView, nextCoverage) =>
      apply({
        view: nextView === DEFAULT_VIEW ? undefined : nextView,
        cov: nextCoverage === DEFAULT_COVERAGE ? undefined : nextCoverage,
        page: undefined,
      }),
    setPage: (p) => apply({ page: p <= 1 ? undefined : p }),
    setPageSize: (size) =>
      apply({ pageSize: size === DEFAULT_PAGE_SIZE ? undefined : size, page: undefined }),
    setSearch: (q) => apply({ q: q.length === 0 ? undefined : q, page: undefined }),
    clearAll: () =>
      apply({
        cats: undefined,
        sub: undefined,
        mans: undefined,
        origin: undefined,
        vbrand: undefined,
        vmodel: undefined,
        vyear: undefined,
        pmin: undefined,
        pmax: undefined,
        stock: undefined,
        status: undefined,
        stores: undefined,
        q: undefined,
        cov: undefined,
        page: undefined,
      }),
  };
}

export { EMPTY_FILTERS };
