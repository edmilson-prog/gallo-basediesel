import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ID, OrderOrigin } from "@/shared/types";
import type { PartCategory } from "@/shared/types/part-identification";

export type SalesPeriodPreset = "today" | "yesterday" | "7d" | "30d" | "90d" | "ytd" | "custom";

/** Canonical channel grouping displayed in the UI. Several order origins collapse into one bucket. */
export type SalesChannel = "whatsapp" | "manual" | "portal" | "ecommerce";

export interface ISalesFiltersState {
  period: SalesPeriodPreset;
  /** Only set when period === "custom". */
  fromIso?: string;
  /** Only set when period === "custom". */
  toIso?: string;
  store: ID | "all";
  seller: ID | "all";
  category: PartCategory | "all";
  vehicleBrand: string | "all";
  channel: SalesChannel | "all";
}

export interface ISalesWindow {
  fromIso: string;
  toIso: string;
}

const VALID_PERIOD = new Set<SalesPeriodPreset>([
  "today",
  "yesterday",
  "7d",
  "30d",
  "90d",
  "ytd",
  "custom",
]);

const VALID_CHANNEL = new Set<SalesChannel>(["whatsapp", "manual", "portal", "ecommerce"]);

const VALID_CATEGORY = new Set<PartCategory>([
  "filtro",
  "freio",
  "correia",
  "motor",
  "embreagem",
  "eletrica",
  "transmissao",
  "suspensao",
  "arrefecimento",
  "lubrificante",
]);

export const DEFAULT_SALES_FILTERS: ISalesFiltersState = {
  period: "30d",
  store: "all",
  seller: "all",
  category: "all",
  vehicleBrand: "all",
  channel: "all",
};

/** Map a canonical channel bucket to the underlying order origins it absorbs. */
export function originToChannel(origin: OrderOrigin): SalesChannel {
  if (origin === "whatsapp") return "whatsapp";
  if (origin === "manual") return "manual";
  if (origin === "ecommerce") return "ecommerce";
  return "portal";
}

/** Translate the period preset into ISO8601 [from, to] bounds for current/previous comparisons. */
export function resolveSalesWindow(
  filters: ISalesFiltersState,
  scope: "current" | "previous",
  now: Date = new Date(),
): ISalesWindow {
  if (filters.period === "custom" && filters.fromIso && filters.toIso) {
    const from = new Date(filters.fromIso).getTime();
    const to = new Date(filters.toIso).getTime();
    const span = Math.max(0, to - from);
    if (scope === "current") {
      return { fromIso: new Date(from).toISOString(), toIso: new Date(to).toISOString() };
    }
    return {
      fromIso: new Date(from - span - 1).toISOString(),
      toIso: new Date(from - 1).toISOString(),
    };
  }

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const dayMs = 24 * 3600_000;

  switch (filters.period) {
    case "today": {
      if (scope === "current") {
        return { fromIso: todayStart.toISOString(), toIso: now.toISOString() };
      }
      const prevStart = new Date(todayStart.getTime() - dayMs);
      const prevEnd = new Date(todayStart.getTime() - 1);
      return { fromIso: prevStart.toISOString(), toIso: prevEnd.toISOString() };
    }
    case "yesterday": {
      const yStart = new Date(todayStart.getTime() - dayMs);
      const yEnd = new Date(todayStart.getTime() - 1);
      if (scope === "current") {
        return { fromIso: yStart.toISOString(), toIso: yEnd.toISOString() };
      }
      const prevStart = new Date(yStart.getTime() - dayMs);
      const prevEnd = new Date(yStart.getTime() - 1);
      return { fromIso: prevStart.toISOString(), toIso: prevEnd.toISOString() };
    }
    case "7d": {
      const start = new Date(now.getTime() - 7 * dayMs);
      if (scope === "current") return { fromIso: start.toISOString(), toIso: now.toISOString() };
      const prevStart = new Date(start.getTime() - 7 * dayMs);
      return { fromIso: prevStart.toISOString(), toIso: start.toISOString() };
    }
    case "30d": {
      const start = new Date(now.getTime() - 30 * dayMs);
      if (scope === "current") return { fromIso: start.toISOString(), toIso: now.toISOString() };
      const prevStart = new Date(start.getTime() - 30 * dayMs);
      return { fromIso: prevStart.toISOString(), toIso: start.toISOString() };
    }
    case "90d": {
      const start = new Date(now.getTime() - 90 * dayMs);
      if (scope === "current") return { fromIso: start.toISOString(), toIso: now.toISOString() };
      const prevStart = new Date(start.getTime() - 90 * dayMs);
      return { fromIso: prevStart.toISOString(), toIso: start.toISOString() };
    }
    case "ytd": {
      const start = new Date(now.getFullYear(), 0, 1);
      if (scope === "current") return { fromIso: start.toISOString(), toIso: now.toISOString() };
      const prevStart = new Date(now.getFullYear() - 1, 0, 1);
      const prevEnd = new Date(start.getTime() - 1);
      return { fromIso: prevStart.toISOString(), toIso: prevEnd.toISOString() };
    }
    default:
      return { fromIso: todayStart.toISOString(), toIso: now.toISOString() };
  }
}

export interface ISalesFiltersSearch {
  periodo?: string;
  de?: string;
  ate?: string;
  loja?: string;
  vendedor?: string;
  categoria?: string;
  marca?: string;
  canal?: string;
  aba?: string;
}

export function validateSalesSearch(raw: Record<string, unknown>): ISalesFiltersSearch {
  const out: ISalesFiltersSearch = {};
  if (typeof raw.periodo === "string" && VALID_PERIOD.has(raw.periodo as SalesPeriodPreset)) {
    out.periodo = raw.periodo;
  }
  if (typeof raw.de === "string" && raw.de.length > 0) out.de = raw.de;
  if (typeof raw.ate === "string" && raw.ate.length > 0) out.ate = raw.ate;
  if (typeof raw.loja === "string" && raw.loja.length > 0) out.loja = raw.loja;
  if (typeof raw.vendedor === "string" && raw.vendedor.length > 0) out.vendedor = raw.vendedor;
  if (typeof raw.categoria === "string" && VALID_CATEGORY.has(raw.categoria as PartCategory)) {
    out.categoria = raw.categoria;
  }
  if (typeof raw.marca === "string" && raw.marca.length > 0) out.marca = raw.marca;
  if (typeof raw.canal === "string" && VALID_CHANNEL.has(raw.canal as SalesChannel)) {
    out.canal = raw.canal;
  }
  if (typeof raw.aba === "string" && raw.aba.length > 0) out.aba = raw.aba;
  return out;
}

function readState(
  search: ISalesFiltersSearch,
  ctx: { gestorLockedStoreId?: ID; sellerLockedId?: ID },
): ISalesFiltersState {
  const period = (search.periodo as SalesPeriodPreset | undefined) ?? DEFAULT_SALES_FILTERS.period;
  return {
    period,
    fromIso: period === "custom" ? search.de : undefined,
    toIso: period === "custom" ? search.ate : undefined,
    store: ctx.gestorLockedStoreId ?? search.loja ?? DEFAULT_SALES_FILTERS.store,
    seller: ctx.sellerLockedId ?? search.vendedor ?? DEFAULT_SALES_FILTERS.seller,
    category: (search.categoria as PartCategory | undefined) ?? DEFAULT_SALES_FILTERS.category,
    vehicleBrand: search.marca ?? DEFAULT_SALES_FILTERS.vehicleBrand,
    channel: (search.canal as SalesChannel | undefined) ?? DEFAULT_SALES_FILTERS.channel,
  };
}

function countActive(
  filters: ISalesFiltersState,
  storeLocked: boolean,
  sellerLocked: boolean,
): number {
  let n = 0;
  if (filters.period !== DEFAULT_SALES_FILTERS.period) n += 1;
  if (!storeLocked && filters.store !== DEFAULT_SALES_FILTERS.store) n += 1;
  if (!sellerLocked && filters.seller !== DEFAULT_SALES_FILTERS.seller) n += 1;
  if (filters.category !== DEFAULT_SALES_FILTERS.category) n += 1;
  if (filters.vehicleBrand !== DEFAULT_SALES_FILTERS.vehicleBrand) n += 1;
  if (filters.channel !== DEFAULT_SALES_FILTERS.channel) n += 1;
  return n;
}

export interface IUseSalesFiltersResult {
  filters: ISalesFiltersState;
  window: ISalesWindow;
  previousWindow: ISalesWindow;
  setPeriod: (period: SalesPeriodPreset, customRange?: { from: string; to: string }) => void;
  setStore: (store: ID | "all") => void;
  setSeller: (seller: ID | "all") => void;
  setCategory: (category: PartCategory | "all") => void;
  setVehicleBrand: (brand: string | "all") => void;
  setChannel: (channel: SalesChannel | "all") => void;
  setTab: (tab: string) => void;
  activeTab: string;
  reset: () => void;
  activeCount: number;
}

const ROUTE_ID = "/app/gestao/vendas" as const;

/**
 * URL-synced filter state for `/app/gestao/vendas`. Mirrors the pattern used by
 * the manager and SDR dashboards. `ctx.gestorLockedStoreId` traps the Gestor in
 * a single store; `ctx.sellerLockedId` traps the Vendedor in their own sales
 * — both setters become no-ops in those cases.
 */
export function useSalesFilters(ctx: {
  gestorLockedStoreId?: ID;
  sellerLockedId?: ID;
}): IUseSalesFiltersResult {
  const search = useSearch({ from: ROUTE_ID }) as ISalesFiltersSearch;
  const navigate = useNavigate({ from: ROUTE_ID });

  const filters = useMemo(() => readState(search, ctx), [search, ctx]);

  const apply = useCallback(
    (patch: Partial<ISalesFiltersSearch>) => {
      void navigate({
        search: (prev) => {
          const next: ISalesFiltersSearch = {
            ...(prev as ISalesFiltersSearch),
            ...patch,
          };
          for (const key of Object.keys(next) as (keyof ISalesFiltersSearch)[]) {
            const value = next[key];
            if (value === undefined || value === "") delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  const setPeriod = useCallback<IUseSalesFiltersResult["setPeriod"]>(
    (period, customRange) => {
      if (period === DEFAULT_SALES_FILTERS.period) {
        apply({ periodo: undefined, de: undefined, ate: undefined });
        return;
      }
      if (period === "custom" && customRange) {
        apply({ periodo: "custom", de: customRange.from, ate: customRange.to });
        return;
      }
      apply({ periodo: period, de: undefined, ate: undefined });
    },
    [apply],
  );

  const window = useMemo(() => resolveSalesWindow(filters, "current"), [filters]);
  const previousWindow = useMemo(() => resolveSalesWindow(filters, "previous"), [filters]);

  const activeTab = (search.aba as string | undefined) ?? "overview";

  return {
    filters,
    window,
    previousWindow,
    setPeriod,
    setStore: (v) => {
      if (ctx.gestorLockedStoreId) return;
      apply({ loja: v === "all" ? undefined : v });
    },
    setSeller: (v) => {
      if (ctx.sellerLockedId) return;
      apply({ vendedor: v === "all" ? undefined : v });
    },
    setCategory: (v) => apply({ categoria: v === "all" ? undefined : v }),
    setVehicleBrand: (v) => apply({ marca: v === "all" ? undefined : v }),
    setChannel: (v) => apply({ canal: v === "all" ? undefined : v }),
    setTab: (tab) => apply({ aba: tab === "overview" ? undefined : tab }),
    activeTab,
    reset: () => void navigate({ search: () => ({}) }),
    activeCount: countActive(
      filters,
      ctx.gestorLockedStoreId !== undefined,
      ctx.sellerLockedId !== undefined,
    ),
  };
}
