import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ID } from "@/shared/types";
import type { PartCategory } from "@/shared/types/part-identification";
import { isCategorySlug } from "@/features/catalog/utils/categories";

export type ProfitabilityTab = "product" | "category" | "customer" | "seller";

const VALID_TABS = new Set<ProfitabilityTab>(["product", "category", "customer", "seller"]);

export interface IProfitabilityFiltersSearch {
  mes?: string;
  vendedor?: string;
  categoria?: string;
  marca?: string;
  aba?: string;
  /** Negative-only / no-cost filters carried in URL. */
  filtro?: "negativo" | "sem-custo";
}

export interface IProfitabilityFiltersState {
  monthKey: string;
  sellerId: ID | "all";
  category: PartCategory | "all";
  brand: string | "all";
  tab: ProfitabilityTab;
  /** Subfilter applied on the product tab. */
  subfilter: "none" | "negativo" | "sem-custo";
}

const ROUTE_ID = "/app/gestao/rentabilidade" as const;

function currentMonthKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function validateProfitabilitySearch(
  raw: Record<string, unknown>,
): IProfitabilityFiltersSearch {
  const out: IProfitabilityFiltersSearch = {};
  if (typeof raw.mes === "string" && /^\d{4}-\d{2}$/.test(raw.mes)) out.mes = raw.mes;
  if (typeof raw.vendedor === "string" && raw.vendedor.length > 0) out.vendedor = raw.vendedor;
  if (isCategorySlug(raw.categoria)) out.categoria = raw.categoria;
  if (typeof raw.marca === "string" && raw.marca.length > 0) out.marca = raw.marca;
  if (typeof raw.aba === "string" && VALID_TABS.has(raw.aba as ProfitabilityTab)) {
    out.aba = raw.aba;
  }
  if (raw.filtro === "negativo" || raw.filtro === "sem-custo") out.filtro = raw.filtro;
  return out;
}

export interface IUseProfitabilityFiltersResult {
  state: IProfitabilityFiltersState;
  setMonthKey: (key: string) => void;
  setSeller: (id: ID | "all") => void;
  setCategory: (cat: PartCategory | "all") => void;
  setBrand: (brand: string | "all") => void;
  setTab: (tab: ProfitabilityTab) => void;
  setSubfilter: (sub: IProfitabilityFiltersState["subfilter"]) => void;
  reset: () => void;
  activeCount: number;
}

/**
 * URL-synced filters for `/app/gestao/rentabilidade`. Mirrors the lightweight
 * pattern used by PRD-041 (`useSalesFilters`).
 */
export function useProfitabilityFilters(): IUseProfitabilityFiltersResult {
  const search = useSearch({ from: ROUTE_ID }) as IProfitabilityFiltersSearch;
  const navigate = useNavigate({ from: ROUTE_ID });

  const state = useMemo<IProfitabilityFiltersState>(
    () => ({
      monthKey: search.mes ?? currentMonthKey(),
      sellerId: (search.vendedor as ID | undefined) ?? "all",
      category: (search.categoria as PartCategory | undefined) ?? "all",
      brand: search.marca ?? "all",
      tab: (search.aba as ProfitabilityTab | undefined) ?? "product",
      subfilter:
        search.filtro === "negativo"
          ? "negativo"
          : search.filtro === "sem-custo"
            ? "sem-custo"
            : "none",
    }),
    [search],
  );

  const apply = useCallback(
    (patch: Partial<IProfitabilityFiltersSearch>) => {
      void navigate({
        search: (prev) => {
          const next: IProfitabilityFiltersSearch = {
            ...(prev as IProfitabilityFiltersSearch),
            ...patch,
          };
          for (const key of Object.keys(next) as (keyof IProfitabilityFiltersSearch)[]) {
            const value = next[key];
            if (value === undefined || value === "") delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  let activeCount = 0;
  if (state.monthKey !== currentMonthKey()) activeCount += 1;
  if (state.sellerId !== "all") activeCount += 1;
  if (state.category !== "all") activeCount += 1;
  if (state.brand !== "all") activeCount += 1;
  if (state.subfilter !== "none") activeCount += 1;

  return {
    state,
    setMonthKey: (key) => apply({ mes: key === currentMonthKey() ? undefined : key }),
    setSeller: (id) => apply({ vendedor: id === "all" ? undefined : id }),
    setCategory: (cat) => apply({ categoria: cat === "all" ? undefined : cat }),
    setBrand: (brand) => apply({ marca: brand === "all" ? undefined : brand }),
    setTab: (tab) => apply({ aba: tab === "product" ? undefined : tab }),
    setSubfilter: (sub) => apply({ filtro: sub === "none" ? undefined : sub }),
    reset: () => void navigate({ search: () => ({}) }),
    activeCount,
  };
}
