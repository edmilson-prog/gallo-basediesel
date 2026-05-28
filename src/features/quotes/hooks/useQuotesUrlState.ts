import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { QuoteOrigin, QuoteStatus } from "@/shared/types";
import { usePersistedListSearch } from "@/shared/hooks/usePersistedListSearch";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  EMPTY_FILTERS,
  PAGE_SIZES,
  type DateRangeBucket,
  type IQuotesListFilters,
  type IQuotesListSort,
  type QuoteOrderBy,
  type QuoteOrderDir,
  type QuotesPageSize,
  type ValidityBucket,
} from "../utils/listFilters";

const VALID_STATUS = new Set<QuoteStatus>([
  "rascunho",
  "enviado",
  "aceito",
  "recusado",
  "expirado",
  "convertido",
]);
const VALID_ORIGIN = new Set<QuoteOrigin>(["sdr", "vendedor", "cliente_portal", "ecommerce"]);
const VALID_VALIDITY = new Set<ValidityBucket>(["any", "expiring_soon", "expired", "valid"]);
const VALID_DATE = new Set<DateRangeBucket>(["any", "24h", "7d", "30d", "custom"]);
const VALID_ORDER_BY = new Set<QuoteOrderBy>([
  "number",
  "customer",
  "origin",
  "seller",
  "status",
  "createdAt",
  "updatedAt",
  "total",
  "validUntil",
]);
const VALID_ORDER_DIR = new Set<QuoteOrderDir>(["asc", "desc"]);

const LIST_SEARCH_STORAGE_KEY = "gallo-quotes-list-search";

export interface IQuotesListSearch {
  statuses?: string;
  origins?: string;
  sellers?: string;
  customer?: string;
  date?: string;
  from?: string;
  to?: string;
  totalMin?: number;
  totalMax?: number;
  validity?: string;
  stores?: string;
  q?: string;
  orderBy?: string;
  orderDir?: string;
  page?: number;
  pageSize?: number;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function validateQuotesSearch(raw: Record<string, unknown>): IQuotesListSearch {
  const out: IQuotesListSearch = {};
  const pass = (key: keyof IQuotesListSearch) => {
    const value = raw[key];
    if (typeof value === "string" && value.length > 0) (out[key] as string) = value;
  };
  pass("statuses");
  pass("origins");
  pass("sellers");
  pass("customer");
  pass("date");
  pass("from");
  pass("to");
  pass("validity");
  pass("stores");
  pass("q");
  pass("orderBy");
  pass("orderDir");
  const tm = num(raw.totalMin);
  if (tm !== undefined) out.totalMin = tm;
  const tx = num(raw.totalMax);
  if (tx !== undefined) out.totalMax = tx;
  const p = num(raw.page);
  if (p !== undefined) out.page = p;
  const ps = num(raw.pageSize);
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

function readFilters(search: IQuotesListSearch): IQuotesListFilters {
  const statuses = splitCsv(search.statuses).filter((s): s is QuoteStatus =>
    VALID_STATUS.has(s as QuoteStatus),
  );
  const origins = splitCsv(search.origins).filter((o): o is QuoteOrigin =>
    VALID_ORIGIN.has(o as QuoteOrigin),
  );
  const validity = (
    search.validity && VALID_VALIDITY.has(search.validity as ValidityBucket)
      ? search.validity
      : "any"
  ) as ValidityBucket;
  const dateRange = (
    search.date && VALID_DATE.has(search.date as DateRangeBucket) ? search.date : "any"
  ) as DateRangeBucket;
  return {
    statuses,
    origins,
    sellerIds: splitCsv(search.sellers),
    customerId: search.customer ?? undefined,
    dateRange,
    dateFrom: search.from ?? undefined,
    dateTo: search.to ?? undefined,
    totalMin: search.totalMin,
    totalMax: search.totalMax,
    validity,
    storeIds: splitCsv(search.stores),
    search: search.q ?? "",
  };
}

function readSort(search: IQuotesListSearch): IQuotesListSort {
  const orderBy =
    search.orderBy && VALID_ORDER_BY.has(search.orderBy as QuoteOrderBy)
      ? (search.orderBy as QuoteOrderBy)
      : DEFAULT_SORT.orderBy;
  const orderDir =
    search.orderDir && VALID_ORDER_DIR.has(search.orderDir as QuoteOrderDir)
      ? (search.orderDir as QuoteOrderDir)
      : DEFAULT_SORT.orderDir;
  return { orderBy, orderDir };
}

function readPage(search: IQuotesListSearch): { page: number; pageSize: QuotesPageSize } {
  const raw = search.pageSize ?? DEFAULT_PAGE_SIZE;
  const pageSize = (PAGE_SIZES as readonly number[]).includes(raw)
    ? (raw as QuotesPageSize)
    : DEFAULT_PAGE_SIZE;
  return { page: Math.max(1, Math.floor(search.page ?? 1)), pageSize };
}

export interface IQuotesUrlState {
  filters: IQuotesListFilters;
  sort: IQuotesListSort;
  page: number;
  pageSize: QuotesPageSize;
  patchFilters: (patch: Partial<IQuotesListFilters>) => void;
  setSort: (sort: IQuotesListSort) => void;
  setPage: (page: number) => void;
  setPageSize: (size: QuotesPageSize) => void;
  setSearch: (q: string) => void;
  clearAll: () => void;
}

export function useQuotesUrlState(): IQuotesUrlState {
  const search = useSearch({ from: "/app/orcamentos/" }) as IQuotesListSearch;
  const navigate = useNavigate({ from: "/app/orcamentos/" });

  const filters = useMemo(() => readFilters(search), [search]);
  const sort = useMemo(() => readSort(search), [search]);
  const { page, pageSize } = useMemo(() => readPage(search), [search]);

  usePersistedListSearch(LIST_SEARCH_STORAGE_KEY, search as Record<string, unknown>, (saved) => {
    void navigate({ search: () => saved as unknown as IQuotesListSearch, replace: true });
  });

  const apply = useCallback(
    (patch: Partial<IQuotesListSearch>) => {
      void navigate({
        search: (prev: unknown) => {
          const next = { ...(prev as IQuotesListSearch), ...patch };
          for (const key of Object.keys(next) as (keyof IQuotesListSearch)[]) {
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
    (f: IQuotesListFilters) => {
      apply({
        statuses: joinCsv(f.statuses),
        origins: joinCsv(f.origins),
        sellers: joinCsv(f.sellerIds),
        customer: f.customerId,
        date: f.dateRange === "any" ? undefined : f.dateRange,
        from: f.dateFrom,
        to: f.dateTo,
        totalMin: f.totalMin,
        totalMax: f.totalMax,
        validity: f.validity === "any" ? undefined : f.validity,
        stores: joinCsv(f.storeIds),
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
        statuses: undefined,
        origins: undefined,
        sellers: undefined,
        customer: undefined,
        date: undefined,
        from: undefined,
        to: undefined,
        totalMin: undefined,
        totalMax: undefined,
        validity: undefined,
        stores: undefined,
        q: undefined,
        page: undefined,
      }),
  };
}

export { EMPTY_FILTERS };
