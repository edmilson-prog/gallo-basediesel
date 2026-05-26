import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ConversationChannel, ID } from "@/shared/types";

export type PeriodPreset = "today" | "yesterday" | "7d" | "30d" | "custom";

export interface IDashboardFiltersState {
  /** Period preset; when "custom" the explicit ISO bounds are used. */
  period: PeriodPreset;
  /** Lower bound (inclusive) — only set when period === "custom". */
  fromIso?: string;
  /** Upper bound (inclusive) — only set when period === "custom". */
  toIso?: string;
  /** Seller id, or `"all"` for every seller. */
  seller: ID | "all";
  /** Store id, or `"all"` for every accessible store (Owner only). */
  store: ID | "all";
  /** Conversation channel, or `"all"` for every channel. */
  channel: ConversationChannel | "all";
}

export interface IDashboardFiltersSearch {
  periodo?: string;
  de?: string;
  ate?: string;
  vendedor?: string;
  loja?: string;
  canal?: string;
}

const VALID_PERIOD = new Set<PeriodPreset>(["today", "yesterday", "7d", "30d", "custom"]);
const VALID_CHANNEL = new Set<ConversationChannel | "all">([
  "all",
  "whatsapp",
  "ecommerce",
  "phone",
  "site",
]);

export const DEFAULT_DASHBOARD_FILTERS: IDashboardFiltersState = {
  period: "today",
  seller: "all",
  store: "all",
  channel: "all",
};

/**
 * Translate the period preset into ISO8601 [from, to] bounds.
 * Used both for filtering data and for the "previous period" comparison —
 * a flag selects between current and previous windows.
 */
export interface IDashboardWindow {
  fromIso: string;
  toIso: string;
}

export function resolveWindow(
  filters: IDashboardFiltersState,
  scope: "current" | "previous",
  now: Date = new Date(),
): IDashboardWindow {
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
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  switch (filters.period) {
    case "today": {
      if (scope === "current") {
        return { fromIso: todayStart.toISOString(), toIso: now.toISOString() };
      }
      const prevStart = new Date(todayStart.getTime() - 24 * 3600_000);
      const prevEnd = new Date(todayStart.getTime() - 1);
      return { fromIso: prevStart.toISOString(), toIso: prevEnd.toISOString() };
    }
    case "yesterday": {
      const yStart = new Date(todayStart.getTime() - 24 * 3600_000);
      const yEnd = new Date(todayStart.getTime() - 1);
      if (scope === "current") return { fromIso: yStart.toISOString(), toIso: yEnd.toISOString() };
      const prevStart = new Date(yStart.getTime() - 24 * 3600_000);
      const prevEnd = new Date(yStart.getTime() - 1);
      return { fromIso: prevStart.toISOString(), toIso: prevEnd.toISOString() };
    }
    case "7d": {
      const start = new Date(now.getTime() - 7 * 24 * 3600_000);
      if (scope === "current") return { fromIso: start.toISOString(), toIso: now.toISOString() };
      const prevStart = new Date(start.getTime() - 7 * 24 * 3600_000);
      return { fromIso: prevStart.toISOString(), toIso: start.toISOString() };
    }
    case "30d": {
      const start = new Date(now.getTime() - 30 * 24 * 3600_000);
      if (scope === "current") return { fromIso: start.toISOString(), toIso: now.toISOString() };
      const prevStart = new Date(start.getTime() - 30 * 24 * 3600_000);
      return { fromIso: prevStart.toISOString(), toIso: start.toISOString() };
    }
    default:
      return { fromIso: todayStart.toISOString(), toIso: now.toISOString() };
  }
}

/**
 * Validate the raw search params dictionary produced by TanStack Router. Unknown
 * or malformed values fall back silently to defaults (URLs survive copy-paste).
 */
export function validateDashboardSearch(raw: Record<string, unknown>): IDashboardFiltersSearch {
  const out: IDashboardFiltersSearch = {};
  if (typeof raw.periodo === "string" && VALID_PERIOD.has(raw.periodo as PeriodPreset)) {
    out.periodo = raw.periodo;
  }
  if (typeof raw.de === "string" && raw.de.length > 0) out.de = raw.de;
  if (typeof raw.ate === "string" && raw.ate.length > 0) out.ate = raw.ate;
  if (typeof raw.vendedor === "string" && raw.vendedor.length > 0) out.vendedor = raw.vendedor;
  if (typeof raw.loja === "string" && raw.loja.length > 0) out.loja = raw.loja;
  if (
    typeof raw.canal === "string" &&
    VALID_CHANNEL.has(raw.canal as ConversationChannel | "all")
  ) {
    out.canal = raw.canal;
  }
  return out;
}

function readState(
  search: IDashboardFiltersSearch,
  ctx: { gestorLockedStoreId?: ID },
): IDashboardFiltersState {
  const period = (search.periodo as PeriodPreset | undefined) ?? DEFAULT_DASHBOARD_FILTERS.period;
  return {
    period,
    fromIso: period === "custom" ? search.de : undefined,
    toIso: period === "custom" ? search.ate : undefined,
    seller: search.vendedor ?? DEFAULT_DASHBOARD_FILTERS.seller,
    store: ctx.gestorLockedStoreId ?? search.loja ?? DEFAULT_DASHBOARD_FILTERS.store,
    channel:
      (search.canal as IDashboardFiltersState["channel"] | undefined) ??
      DEFAULT_DASHBOARD_FILTERS.channel,
  };
}

export interface IUseDashboardFiltersResult {
  filters: IDashboardFiltersState;
  window: IDashboardWindow;
  previousWindow: IDashboardWindow;
  setPeriod: (period: PeriodPreset, customRange?: { from: string; to: string }) => void;
  setSeller: (seller: ID | "all") => void;
  setStore: (store: ID | "all") => void;
  setChannel: (channel: ConversationChannel | "all") => void;
  reset: () => void;
  activeCount: number;
}

/**
 * URL-synced dashboard filter state.
 *
 * Mirrors the inbox filters pattern: the URL is the single source of truth;
 * setters write back via `navigate({ search })`. Default values are removed so
 * the URL bar stays clean (`?vendedor=carlos` not `?periodo=today&vendedor=carlos&…`).
 *
 * The Gestor variant locks the `store` filter to the active store — `setStore`
 * becomes a no-op for that role.
 */
export function useDashboardFilters(ctx: { gestorLockedStoreId?: ID }): IUseDashboardFiltersResult {
  const search = useSearch({ from: "/app/inicio" }) as IDashboardFiltersSearch;
  const navigate = useNavigate({ from: "/app/inicio" });
  const filters = useMemo(() => readState(search, ctx), [search, ctx]);

  const apply = useCallback(
    (patch: Partial<IDashboardFiltersSearch>) => {
      void navigate({
        search: (prev) => {
          const next: IDashboardFiltersSearch = { ...(prev as IDashboardFiltersSearch), ...patch };
          for (const key of Object.keys(next) as (keyof IDashboardFiltersSearch)[]) {
            const value = next[key];
            if (value === undefined || value === "") delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  const setPeriod = useCallback<IUseDashboardFiltersResult["setPeriod"]>(
    (period, customRange) => {
      if (period === "today") {
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

  const window = useMemo(() => resolveWindow(filters, "current"), [filters]);
  const previousWindow = useMemo(() => resolveWindow(filters, "previous"), [filters]);

  return {
    filters,
    window,
    previousWindow,
    setPeriod,
    setSeller: (v) => apply({ vendedor: v === "all" ? undefined : v }),
    setStore: (v) => {
      if (ctx.gestorLockedStoreId) return;
      apply({ loja: v === "all" ? undefined : v });
    },
    setChannel: (v) => apply({ canal: v === "all" ? undefined : v }),
    reset: () => void navigate({ search: () => ({}) }),
    activeCount: countActive(filters, ctx.gestorLockedStoreId !== undefined),
  };
}

function countActive(filters: IDashboardFiltersState, storeLocked: boolean): number {
  let n = 0;
  if (filters.period !== DEFAULT_DASHBOARD_FILTERS.period) n += 1;
  if (filters.seller !== DEFAULT_DASHBOARD_FILTERS.seller) n += 1;
  if (!storeLocked && filters.store !== DEFAULT_DASHBOARD_FILTERS.store) n += 1;
  if (filters.channel !== DEFAULT_DASHBOARD_FILTERS.channel) n += 1;
  return n;
}
