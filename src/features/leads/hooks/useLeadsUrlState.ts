import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { LeadOrigin, LeadTemperature } from "@/shared/types";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  EMPTY_FILTERS,
  LEAD_ORIGINS,
  LEAD_TEMPERATURES,
  LEADS_ORDER_BY,
  NEXT_ACTION_FILTERS,
  PAGE_SIZES,
  PERIOD_FILTERS,
  type ILeadsListFilters,
  type ILeadsListSort,
  type LeadsOrderBy,
  type LeadsOrderDir,
  type NextActionFilter,
  type PageSize,
  type PeriodFilter,
} from "../utils/listFilters";

export type LeadsView = "kanban" | "list";

export interface ILeadsListSearch {
  view?: string;
  /**
   * Active funnel, or the "todos" sentinel. Lives in the URL rather than in
   * the layout preference so the board is deep-linkable, survives F5 and can
   * be pasted to a colleague — and so switching navigation pattern keeps the
   * funnel, the scroll and the filters exactly where they were.
   */
  funil?: string;
  stages?: string;
  temperatures?: string;
  origins?: string;
  sellers?: string;
  stores?: string;
  nextAction?: string;
  period?: string;
  valueMin?: number;
  valueMax?: number;
  includeLost?: string;
  includeConverted?: string;
  q?: string;
  orderBy?: string;
  orderDir?: string;
  page?: number;
  pageSize?: number;
}

const VALID_VIEW = new Set<LeadsView>(["kanban", "list"]);
const VALID_TEMP = new Set<LeadTemperature>(LEAD_TEMPERATURES);
const VALID_ORIGIN = new Set<LeadOrigin>(LEAD_ORIGINS);
const VALID_NEXT = new Set<NextActionFilter>(NEXT_ACTION_FILTERS);
const VALID_PERIOD = new Set<PeriodFilter>(PERIOD_FILTERS);
const VALID_ORDER_BY = new Set<LeadsOrderBy>(LEADS_ORDER_BY);
const VALID_ORDER_DIR = new Set<LeadsOrderDir>(["asc", "desc"]);

function numberOrUndefined(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function validateLeadsSearch(raw: Record<string, unknown>): ILeadsListSearch {
  const out: ILeadsListSearch = {};
  if (typeof raw.view === "string" && raw.view.length > 0) out.view = raw.view;
  if (typeof raw.funil === "string" && raw.funil.length > 0) out.funil = raw.funil;
  if (typeof raw.stages === "string" && raw.stages.length > 0) out.stages = raw.stages;
  if (typeof raw.temperatures === "string" && raw.temperatures.length > 0)
    out.temperatures = raw.temperatures;
  if (typeof raw.origins === "string" && raw.origins.length > 0) out.origins = raw.origins;
  if (typeof raw.sellers === "string" && raw.sellers.length > 0) out.sellers = raw.sellers;
  if (typeof raw.stores === "string" && raw.stores.length > 0) out.stores = raw.stores;
  if (typeof raw.nextAction === "string" && raw.nextAction.length > 0)
    out.nextAction = raw.nextAction;
  if (typeof raw.period === "string" && raw.period.length > 0) out.period = raw.period;
  const vMin = numberOrUndefined(raw.valueMin);
  if (vMin !== undefined) out.valueMin = vMin;
  const vMax = numberOrUndefined(raw.valueMax);
  if (vMax !== undefined) out.valueMax = vMax;
  if (typeof raw.includeLost === "string") out.includeLost = raw.includeLost;
  if (typeof raw.includeConverted === "string") out.includeConverted = raw.includeConverted;
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

function readView(value: string | undefined): LeadsView {
  if (value && VALID_VIEW.has(value as LeadsView)) return value as LeadsView;
  return "kanban";
}

function readFilters(search: ILeadsListSearch): ILeadsListFilters {
  return {
    stageIds: splitCsv(search.stages),
    temperatures: splitCsv(search.temperatures).filter((s): s is LeadTemperature =>
      VALID_TEMP.has(s as LeadTemperature),
    ),
    origins: splitCsv(search.origins).filter((s): s is LeadOrigin =>
      VALID_ORIGIN.has(s as LeadOrigin),
    ),
    sellerIds: splitCsv(search.sellers),
    storeIds: splitCsv(search.stores),
    nextAction:
      search.nextAction && VALID_NEXT.has(search.nextAction as NextActionFilter)
        ? (search.nextAction as NextActionFilter)
        : "any",
    period:
      search.period && VALID_PERIOD.has(search.period as PeriodFilter)
        ? (search.period as PeriodFilter)
        : "any",
    valueMin: search.valueMin,
    valueMax: search.valueMax,
    search: search.q ?? "",
    includeLost: search.includeLost === "1",
    includeConverted: search.includeConverted === "1",
  };
}

function readSort(search: ILeadsListSearch): ILeadsListSort {
  const orderBy =
    search.orderBy && VALID_ORDER_BY.has(search.orderBy as LeadsOrderBy)
      ? (search.orderBy as LeadsOrderBy)
      : DEFAULT_SORT.orderBy;
  const orderDir =
    search.orderDir && VALID_ORDER_DIR.has(search.orderDir as LeadsOrderDir)
      ? (search.orderDir as LeadsOrderDir)
      : DEFAULT_SORT.orderDir;
  return { orderBy, orderDir };
}

function readPage(search: ILeadsListSearch): { page: number; pageSize: PageSize } {
  const rawPageSize = search.pageSize ?? DEFAULT_PAGE_SIZE;
  const pageSize = (PAGE_SIZES as readonly number[]).includes(rawPageSize)
    ? (rawPageSize as PageSize)
    : DEFAULT_PAGE_SIZE;
  return { page: Math.max(1, Math.floor(search.page ?? 1)), pageSize };
}

export interface ILeadsUrlState {
  view: LeadsView;
  /** Active funnel id, or the "todos" sentinel. Undefined before resolution. */
  funnelId: string | undefined;
  setFunnel: (id: string | undefined) => void;
  filters: ILeadsListFilters;
  sort: ILeadsListSort;
  page: number;
  pageSize: PageSize;
  setView: (view: LeadsView) => void;
  patchFilters: (patch: Partial<ILeadsListFilters>) => void;
  setSort: (next: ILeadsListSort) => void;
  setPage: (page: number) => void;
  setPageSize: (size: PageSize) => void;
  setSearch: (q: string) => void;
  clearAll: () => void;
}

export function useLeadsUrlState(): ILeadsUrlState {
  const search = useSearch({ from: "/app/leads/" }) as ILeadsListSearch;
  const navigate = useNavigate({ from: "/app/leads/" });

  const view = useMemo(() => readView(search.view), [search.view]);
  const filters = useMemo(() => readFilters(search), [search]);
  const sort = useMemo(() => readSort(search), [search]);
  const { page, pageSize } = useMemo(() => readPage(search), [search]);

  const apply = useCallback(
    (patch: Partial<ILeadsListSearch>) => {
      void navigate({
        search: (prev) => {
          const next = { ...(prev as ILeadsListSearch), ...patch };
          for (const key of Object.keys(next) as (keyof ILeadsListSearch)[]) {
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
    (f: ILeadsListFilters) => {
      apply({
        stages: joinCsv(f.stageIds),
        temperatures: joinCsv(f.temperatures),
        origins: joinCsv(f.origins),
        sellers: joinCsv(f.sellerIds),
        stores: joinCsv(f.storeIds),
        nextAction: f.nextAction === "any" ? undefined : f.nextAction,
        period: f.period === "any" ? undefined : f.period,
        valueMin: f.valueMin,
        valueMax: f.valueMax,
        q: f.search.trim() ? f.search.trim() : undefined,
        includeLost: f.includeLost ? "1" : undefined,
        includeConverted: f.includeConverted ? "1" : undefined,
        page: undefined,
      });
    },
    [apply],
  );

  return {
    view,
    funnelId: search.funil,
    // Switching funnel resets pagination but keeps filters, sort and search:
    // the user is narrowing the same question, not asking a new one.
    setFunnel: (id) => apply({ funil: id, page: undefined }),
    filters,
    sort,
    page,
    pageSize,
    setView: (next) => apply({ view: next === "kanban" ? undefined : next }),
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
    clearAll: () => writeFilters(EMPTY_FILTERS),
  };
}
