import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { OrderFulfillmentStatus, OrderPaymentStatus, OrderStatus } from "@/shared/types";
import {
  EMPTY_ORDER_FILTERS,
  ORDER_DEFAULT_PAGE_SIZE,
  ORDER_DEFAULT_SORT,
  ORDER_PAGE_SIZES,
  type IOrdersListFilters,
  type IOrdersListSort,
  type OrderDateRangeBucket,
  type OrderOrderBy,
  type OrderOrderDir,
  type OrderOriginFilterKind,
  type OrdersPageSize,
} from "../utils/listFilters";

const VALID_STATUS = new Set<OrderStatus>([
  "aguardando_pagamento",
  "pago_aguardando_envio",
  "em_separacao",
  "enviado",
  "entregue",
  "concluido",
  "cancelado",
  "devolvido",
]);
const VALID_PAYMENT = new Set<OrderPaymentStatus>([
  "pendente",
  "parcial",
  "pago",
  "estornado",
  "vencido",
]);
const VALID_FULFILL = new Set<OrderFulfillmentStatus>([
  "pendente",
  "separacao",
  "expedido",
  "entregue",
  "cancelado",
  "devolvido",
]);
const VALID_ORIGIN = new Set<OrderOriginFilterKind>([
  "sdr",
  "quote",
  "manual",
  "ecommerce",
  "portal",
]);
const VALID_DATE = new Set<OrderDateRangeBucket>(["any", "24h", "7d", "30d", "90d", "custom"]);
const VALID_ORDER_BY = new Set<OrderOrderBy>(["createdAt", "updatedAt", "total"]);
const VALID_ORDER_DIR = new Set<OrderOrderDir>(["asc", "desc"]);

export interface IOrdersListSearch {
  statuses?: string;
  payments?: string;
  fulfillments?: string;
  sellers?: string;
  customer?: string;
  date?: string;
  from?: string;
  to?: string;
  totalMin?: number;
  totalMax?: number;
  origins?: string;
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

export function validateOrdersSearch(raw: Record<string, unknown>): IOrdersListSearch {
  const out: IOrdersListSearch = {};
  const pass = (key: keyof IOrdersListSearch) => {
    const value = raw[key];
    if (typeof value === "string" && value.length > 0) (out[key] as string) = value;
  };
  pass("statuses");
  pass("payments");
  pass("fulfillments");
  pass("sellers");
  pass("customer");
  pass("date");
  pass("from");
  pass("to");
  pass("origins");
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

function readFilters(search: IOrdersListSearch): IOrdersListFilters {
  const statuses = splitCsv(search.statuses).filter((s): s is OrderStatus =>
    VALID_STATUS.has(s as OrderStatus),
  );
  const paymentStatuses = splitCsv(search.payments).filter((p): p is OrderPaymentStatus =>
    VALID_PAYMENT.has(p as OrderPaymentStatus),
  );
  const fulfillmentStatuses = splitCsv(search.fulfillments).filter(
    (f): f is OrderFulfillmentStatus => VALID_FULFILL.has(f as OrderFulfillmentStatus),
  );
  const origins = splitCsv(search.origins).filter((o): o is OrderOriginFilterKind =>
    VALID_ORIGIN.has(o as OrderOriginFilterKind),
  );
  const dateRange = (
    search.date && VALID_DATE.has(search.date as OrderDateRangeBucket) ? search.date : "any"
  ) as OrderDateRangeBucket;
  return {
    statuses,
    paymentStatuses,
    fulfillmentStatuses,
    sellerIds: splitCsv(search.sellers),
    customerId: search.customer ?? undefined,
    dateRange,
    dateFrom: search.from ?? undefined,
    dateTo: search.to ?? undefined,
    totalMin: search.totalMin,
    totalMax: search.totalMax,
    origins,
    storeIds: splitCsv(search.stores),
    search: search.q ?? "",
  };
}

function readSort(search: IOrdersListSearch): IOrdersListSort {
  const orderBy =
    search.orderBy && VALID_ORDER_BY.has(search.orderBy as OrderOrderBy)
      ? (search.orderBy as OrderOrderBy)
      : ORDER_DEFAULT_SORT.orderBy;
  const orderDir =
    search.orderDir && VALID_ORDER_DIR.has(search.orderDir as OrderOrderDir)
      ? (search.orderDir as OrderOrderDir)
      : ORDER_DEFAULT_SORT.orderDir;
  return { orderBy, orderDir };
}

function readPage(search: IOrdersListSearch): { page: number; pageSize: OrdersPageSize } {
  const raw = search.pageSize ?? ORDER_DEFAULT_PAGE_SIZE;
  const pageSize = (ORDER_PAGE_SIZES as readonly number[]).includes(raw)
    ? (raw as OrdersPageSize)
    : ORDER_DEFAULT_PAGE_SIZE;
  return { page: Math.max(1, Math.floor(search.page ?? 1)), pageSize };
}

export interface IOrdersUrlState {
  filters: IOrdersListFilters;
  sort: IOrdersListSort;
  page: number;
  pageSize: OrdersPageSize;
  patchFilters: (patch: Partial<IOrdersListFilters>) => void;
  setSort: (sort: IOrdersListSort) => void;
  setPage: (page: number) => void;
  setPageSize: (size: OrdersPageSize) => void;
  setSearch: (q: string) => void;
  clearAll: () => void;
}

export function useOrdersUrlState(): IOrdersUrlState {
  const search = useSearch({ from: "/app/pedidos/" }) as IOrdersListSearch;
  const navigate = useNavigate({ from: "/app/pedidos/" });

  const filters = useMemo(() => readFilters(search), [search]);
  const sort = useMemo(() => readSort(search), [search]);
  const { page, pageSize } = useMemo(() => readPage(search), [search]);

  const apply = useCallback(
    (patch: Partial<IOrdersListSearch>) => {
      void navigate({
        search: (prev: unknown) => {
          const next = { ...(prev as IOrdersListSearch), ...patch };
          for (const key of Object.keys(next) as (keyof IOrdersListSearch)[]) {
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
    (f: IOrdersListFilters) => {
      apply({
        statuses: joinCsv(f.statuses),
        payments: joinCsv(f.paymentStatuses),
        fulfillments: joinCsv(f.fulfillmentStatuses),
        sellers: joinCsv(f.sellerIds),
        customer: f.customerId,
        date: f.dateRange === "any" ? undefined : f.dateRange,
        from: f.dateFrom,
        to: f.dateTo,
        totalMin: f.totalMin,
        totalMax: f.totalMax,
        origins: joinCsv(f.origins),
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
        orderBy: next.orderBy === ORDER_DEFAULT_SORT.orderBy ? undefined : next.orderBy,
        orderDir: next.orderDir === ORDER_DEFAULT_SORT.orderDir ? undefined : next.orderDir,
      }),
    setPage: (p) => apply({ page: p <= 1 ? undefined : p }),
    setPageSize: (size) =>
      apply({
        pageSize: size === ORDER_DEFAULT_PAGE_SIZE ? undefined : size,
        page: undefined,
      }),
    setSearch: (q) => apply({ q: q.length === 0 ? undefined : q, page: undefined }),
    clearAll: () =>
      apply({
        statuses: undefined,
        payments: undefined,
        fulfillments: undefined,
        sellers: undefined,
        customer: undefined,
        date: undefined,
        from: undefined,
        to: undefined,
        totalMin: undefined,
        totalMax: undefined,
        origins: undefined,
        stores: undefined,
        q: undefined,
        page: undefined,
      }),
  };
}

export { EMPTY_ORDER_FILTERS };
