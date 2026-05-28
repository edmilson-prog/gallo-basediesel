import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { CustomerStatus, ICustomer, ID } from "@/shared/types";
import type { INumericRange, RecencyBucket } from "@/providers/data";
import {
  ABC_KEYS,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  EMPTY_FILTERS,
  PAGE_SIZES,
  RECENCY_BUCKETS,
  STATUS_KEYS,
  VEHICLE_BRANDS,
  type AbcKey,
  type CustomersOrderBy,
  type CustomersOrderDir,
  type ICustomersListFilters,
  type ICustomersListSort,
  type PageSize,
  type VehicleBrandName,
} from "../utils/listFilters";

export interface ICustomersListSearch {
  status?: string;
  type?: string;
  abc?: string;
  tags?: string;
  sellers?: string;
  recency?: string;
  recencyMin?: number;
  recencyMax?: number;
  ticketMin?: number;
  ticketMax?: number;
  ltvMin?: number;
  ltvMax?: number;
  brands?: string;
  stores?: string;
  pos?: string;
  b2b?: boolean;
  q?: string;
  orderBy?: string;
  orderDir?: string;
  page?: number;
  pageSize?: number;
  segment?: string;
  selected?: string;
}

const VALID_ORDER_BY = new Set<CustomersOrderBy>([
  "name",
  "type",
  "document",
  "seller",
  "tags",
  "city",
  "lastPurchaseAt",
  "createdAt",
  "ticketMedio",
  "ltv",
  "recency",
  "abcClass",
  "status",
]);
const VALID_ORDER_DIR = new Set<CustomersOrderDir>(["asc", "desc"]);
const VALID_STATUS = new Set<CustomerStatus>(STATUS_KEYS);
const VALID_ABC = new Set<AbcKey>(ABC_KEYS);
const VALID_RECENCY = new Set<RecencyBucket>(RECENCY_BUCKETS);
const VALID_BRANDS = new Set<string>([...VEHICLE_BRANDS, "any"]);

/**
 * Permissive validator for `/app/clientes` URL search params. Unknown values
 * are dropped silently so paste-shared URLs always render cleanly.
 */
export function validateCustomersSearch(raw: Record<string, unknown>): ICustomersListSearch {
  const out: ICustomersListSearch = {};
  if (typeof raw.status === "string" && raw.status.length > 0) out.status = raw.status;
  if (typeof raw.type === "string") out.type = raw.type;
  if (typeof raw.abc === "string" && raw.abc.length > 0) out.abc = raw.abc;
  if (typeof raw.tags === "string" && raw.tags.length > 0) out.tags = raw.tags;
  if (typeof raw.sellers === "string" && raw.sellers.length > 0) out.sellers = raw.sellers;
  if (typeof raw.recency === "string" && raw.recency.length > 0) out.recency = raw.recency;
  if (numberOrNull(raw.recencyMin) !== null) out.recencyMin = Number(raw.recencyMin);
  if (numberOrNull(raw.recencyMax) !== null) out.recencyMax = Number(raw.recencyMax);
  if (numberOrNull(raw.ticketMin) !== null) out.ticketMin = Number(raw.ticketMin);
  if (numberOrNull(raw.ticketMax) !== null) out.ticketMax = Number(raw.ticketMax);
  if (numberOrNull(raw.ltvMin) !== null) out.ltvMin = Number(raw.ltvMin);
  if (numberOrNull(raw.ltvMax) !== null) out.ltvMax = Number(raw.ltvMax);
  if (typeof raw.brands === "string" && raw.brands.length > 0) out.brands = raw.brands;
  if (typeof raw.stores === "string" && raw.stores.length > 0) out.stores = raw.stores;
  if (raw.pos === "positivado" || raw.pos === "nao_positivado") out.pos = raw.pos;
  if (raw.b2b === true || raw.b2b === "true") out.b2b = true;
  if (typeof raw.q === "string" && raw.q.length > 0) out.q = raw.q;
  if (typeof raw.orderBy === "string") out.orderBy = raw.orderBy;
  if (typeof raw.orderDir === "string") out.orderDir = raw.orderDir;
  if (numberOrNull(raw.page) !== null) out.page = Number(raw.page);
  if (numberOrNull(raw.pageSize) !== null) out.pageSize = Number(raw.pageSize);
  if (typeof raw.segment === "string" && raw.segment.length > 0) out.segment = raw.segment;
  if (typeof raw.selected === "string" && raw.selected.length > 0) out.selected = raw.selected;
  return out;
}

function numberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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

function parseStatuses(raw: string | undefined): CustomerStatus[] {
  return splitCsv(raw).filter((s): s is CustomerStatus => VALID_STATUS.has(s as CustomerStatus));
}
function parseAbc(raw: string | undefined): AbcKey[] {
  return splitCsv(raw).filter((s): s is AbcKey => VALID_ABC.has(s as AbcKey));
}
function parseRecency(raw: string | undefined): RecencyBucket[] {
  return splitCsv(raw).filter((s): s is RecencyBucket => VALID_RECENCY.has(s as RecencyBucket));
}
function parseBrands(raw: string | undefined): (VehicleBrandName | "any")[] {
  return splitCsv(raw).filter((s): s is VehicleBrandName | "any" => VALID_BRANDS.has(s));
}

function readFilters(search: ICustomersListSearch): ICustomersListFilters {
  const ticketRange: INumericRange | undefined =
    search.ticketMin !== undefined || search.ticketMax !== undefined
      ? { min: search.ticketMin, max: search.ticketMax }
      : undefined;
  const ltvRange: INumericRange | undefined =
    search.ltvMin !== undefined || search.ltvMax !== undefined
      ? { min: search.ltvMin, max: search.ltvMax }
      : undefined;
  const recencyCustom =
    search.recencyMin !== undefined || search.recencyMax !== undefined
      ? { minDays: search.recencyMin, maxDays: search.recencyMax }
      : undefined;
  const type: ICustomersListFilters["type"] =
    search.type === "B2B" || search.type === "B2C" ? search.type : "all";
  const positivation: ICustomersListFilters["positivation"] =
    search.pos === "positivado" || search.pos === "nao_positivado" ? search.pos : "all";
  return {
    statuses: parseStatuses(search.status),
    type,
    abcClasses: parseAbc(search.abc),
    tags: splitCsv(search.tags),
    sellerIds: splitCsv(search.sellers),
    recencyBuckets: parseRecency(search.recency),
    recencyCustom,
    ticketRange,
    ltvRange,
    vehicleBrands: parseBrands(search.brands),
    storeIds: splitCsv(search.stores),
    positivation,
    hasB2BPortal: search.b2b === true,
    search: search.q ?? "",
  };
}

function readSort(search: ICustomersListSearch): ICustomersListSort {
  const orderBy =
    search.orderBy && VALID_ORDER_BY.has(search.orderBy as CustomersOrderBy)
      ? (search.orderBy as CustomersOrderBy)
      : DEFAULT_SORT.orderBy;
  const orderDir =
    search.orderDir && VALID_ORDER_DIR.has(search.orderDir as CustomersOrderDir)
      ? (search.orderDir as CustomersOrderDir)
      : DEFAULT_SORT.orderDir;
  return { orderBy, orderDir };
}

function readPage(search: ICustomersListSearch): { page: number; pageSize: PageSize } {
  const rawPageSize = search.pageSize ?? DEFAULT_PAGE_SIZE;
  const pageSize = (PAGE_SIZES as readonly number[]).includes(rawPageSize)
    ? (rawPageSize as PageSize)
    : DEFAULT_PAGE_SIZE;
  return { page: Math.max(1, Math.floor(search.page ?? 1)), pageSize };
}

export interface ICustomersUrlState {
  filters: ICustomersListFilters;
  sort: ICustomersListSort;
  page: number;
  pageSize: PageSize;
  segmentId: string | null;
  selectedId: ID | null;
  setFilters: (next: ICustomersListFilters) => void;
  patchFilters: (patch: Partial<ICustomersListFilters>) => void;
  setSort: (next: ICustomersListSort) => void;
  setPage: (page: number) => void;
  setPageSize: (size: PageSize) => void;
  setSearch: (q: string) => void;
  setSegmentId: (id: string | null) => void;
  setSelectedId: (id: ID | null) => void;
  clearAll: () => void;
}

export function useCustomersUrlState(): ICustomersUrlState {
  const search = useSearch({ from: "/app/clientes/" }) as ICustomersListSearch;
  const navigate = useNavigate({ from: "/app/clientes/" });

  const filters = useMemo(() => readFilters(search), [search]);
  const sort = useMemo(() => readSort(search), [search]);
  const { page, pageSize } = useMemo(() => readPage(search), [search]);

  const apply = useCallback(
    (patch: Partial<ICustomersListSearch>) => {
      void navigate({
        search: (prev) => {
          const next = { ...(prev as ICustomersListSearch), ...patch };
          for (const key of Object.keys(next) as (keyof ICustomersListSearch)[]) {
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
    (f: ICustomersListFilters) => {
      apply({
        status: joinCsv(f.statuses),
        type: f.type === "all" ? undefined : f.type,
        abc: joinCsv(f.abcClasses),
        tags: joinCsv(f.tags),
        sellers: joinCsv(f.sellerIds),
        recency: joinCsv(f.recencyBuckets),
        recencyMin: f.recencyCustom?.minDays,
        recencyMax: f.recencyCustom?.maxDays,
        ticketMin: f.ticketRange?.min,
        ticketMax: f.ticketRange?.max,
        ltvMin: f.ltvRange?.min,
        ltvMax: f.ltvRange?.max,
        brands: joinCsv(f.vehicleBrands),
        stores: joinCsv(f.storeIds),
        pos: f.positivation === "all" ? undefined : f.positivation,
        b2b: f.hasB2BPortal ? true : undefined,
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
    segmentId: search.segment ?? null,
    selectedId: search.selected ?? null,
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
    setSegmentId: (id) => apply({ segment: id ?? undefined }),
    setSelectedId: (id) => apply({ selected: id ?? undefined }),
    clearAll: () =>
      apply({
        status: undefined,
        type: undefined,
        abc: undefined,
        tags: undefined,
        sellers: undefined,
        recency: undefined,
        recencyMin: undefined,
        recencyMax: undefined,
        ticketMin: undefined,
        ticketMax: undefined,
        ltvMin: undefined,
        ltvMax: undefined,
        brands: undefined,
        stores: undefined,
        pos: undefined,
        b2b: undefined,
        segment: undefined,
        page: undefined,
      }),
  };
}

export { EMPTY_FILTERS };
