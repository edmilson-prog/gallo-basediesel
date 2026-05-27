import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ID } from "@/shared/types";

export type CsaTab = "overview" | "channel" | "seller" | "escalations";

const VALID_TABS = new Set<CsaTab>(["overview", "channel", "seller", "escalations"]);

export interface ICsaFiltersSearch {
  mes?: string;
  vendedor?: string;
  aba?: string;
}

export function validateCsaSearch(raw: Record<string, unknown>): ICsaFiltersSearch {
  const out: ICsaFiltersSearch = {};
  if (typeof raw.mes === "string" && /^\d{4}-\d{2}$/.test(raw.mes)) out.mes = raw.mes;
  if (typeof raw.vendedor === "string" && raw.vendedor.length > 0) out.vendedor = raw.vendedor;
  if (typeof raw.aba === "string" && VALID_TABS.has(raw.aba as CsaTab)) out.aba = raw.aba;
  return out;
}

const ROUTE_ID = "/app/gestao/atendimento-analise" as const;

function currentMonth(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface ICsaFiltersState {
  monthKey: string;
  sellerId: ID | "all";
  tab: CsaTab;
}

export interface IUseCsaFiltersResult {
  state: ICsaFiltersState;
  setMonthKey: (key: string) => void;
  setSellerId: (id: ID | "all") => void;
  setTab: (tab: CsaTab) => void;
  reset: () => void;
}

export function useCsaFilters(): IUseCsaFiltersResult {
  const search = useSearch({ from: ROUTE_ID }) as ICsaFiltersSearch;
  const navigate = useNavigate({ from: ROUTE_ID });

  const state = useMemo<ICsaFiltersState>(
    () => ({
      monthKey: search.mes ?? currentMonth(),
      sellerId: (search.vendedor as ID | undefined) ?? "all",
      tab: (search.aba as CsaTab | undefined) ?? "overview",
    }),
    [search],
  );

  const apply = useCallback(
    (patch: Partial<ICsaFiltersSearch>) => {
      void navigate({
        search: (prev) => {
          const next: ICsaFiltersSearch = { ...(prev as ICsaFiltersSearch), ...patch };
          for (const key of Object.keys(next) as (keyof ICsaFiltersSearch)[]) {
            const v = next[key];
            if (v === undefined || v === "") delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  return {
    state,
    setMonthKey: (key) => apply({ mes: key === currentMonth() ? undefined : key }),
    setSellerId: (id) => apply({ vendedor: id === "all" ? undefined : id }),
    setTab: (tab) => apply({ aba: tab === "overview" ? undefined : tab }),
    reset: () => void navigate({ search: () => ({}) }),
  };
}
