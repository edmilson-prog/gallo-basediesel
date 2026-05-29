import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { CashFlowSource, CashFlowStatus } from "@/shared/types";
import { currentMonthKey, type ExpensePeriodKind } from "@/features/expenses/utils/period";

const MONTH_REGEX = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const KINDS: ExpensePeriodKind[] = ["mensal", "trimestral", "anual"];
const SOURCES: CashFlowSource[] = ["pedido", "despesa", "comissao", "aporte", "retirada", "outro"];

/** "ambos" = both directions / both statuses. */
export type CashFlowDirFilter = "ambos" | "entrada" | "saida";
export type CashFlowStatusFilter = "ambos" | CashFlowStatus;

export interface ICashFlowFiltersSearch {
  mes?: string;
  periodo?: ExpensePeriodKind;
  dir?: CashFlowDirFilter;
  status?: CashFlowStatusFilter;
  origem?: string;
}

export interface ICashFlowFiltersState {
  monthKey: string;
  kind: ExpensePeriodKind;
  direction: CashFlowDirFilter;
  status: CashFlowStatusFilter;
  sources: CashFlowSource[];
}

export function validateCashFlowSearch(raw: Record<string, unknown>): ICashFlowFiltersSearch {
  const out: ICashFlowFiltersSearch = {};
  if (typeof raw.mes === "string" && MONTH_REGEX.test(raw.mes)) out.mes = raw.mes;
  if (typeof raw.periodo === "string" && (KINDS as string[]).includes(raw.periodo)) {
    out.periodo = raw.periodo as ExpensePeriodKind;
  }
  if (raw.dir === "entrada" || raw.dir === "saida" || raw.dir === "ambos") out.dir = raw.dir;
  if (raw.status === "realizado" || raw.status === "previsto" || raw.status === "ambos") {
    out.status = raw.status;
  }
  if (typeof raw.origem === "string" && raw.origem.length > 0) out.origem = raw.origem;
  return out;
}

function parseSources(raw: string | undefined): CashFlowSource[] {
  if (!raw) return [];
  const set = new Set(SOURCES);
  return raw.split(",").filter((v): v is CashFlowSource => set.has(v as CashFlowSource));
}

export interface IUseCashFlowFiltersResult {
  filters: ICashFlowFiltersState;
  setMonth: (monthKey: string) => void;
  setKind: (kind: ExpensePeriodKind) => void;
  setDirection: (dir: CashFlowDirFilter) => void;
  setStatus: (status: CashFlowStatusFilter) => void;
  toggleSource: (source: CashFlowSource) => void;
  reset: () => void;
  activeCount: number;
}

/** URL-synced filters for the cash flow page (PRD-055 RF-013). */
export function useCashFlowFilters(): IUseCashFlowFiltersResult {
  const search = useSearch({ strict: false }) as ICashFlowFiltersSearch;
  const navigate = useNavigate();

  const filters: ICashFlowFiltersState = useMemo(
    () => ({
      monthKey: search.mes ?? currentMonthKey(),
      kind: search.periodo ?? "mensal",
      direction: search.dir ?? "ambos",
      status: search.status ?? "ambos",
      sources: parseSources(search.origem),
    }),
    [search],
  );

  const apply = useCallback(
    (patch: Partial<ICashFlowFiltersSearch>) => {
      void navigate({
        search: (prev: Record<string, unknown>) => {
          const next: Record<string, unknown> = { ...prev, ...patch };
          for (const key of Object.keys(next)) {
            const value = next[key];
            if (value === undefined || value === "" || value === "ambos") delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  const toggleIn = (list: CashFlowSource[], value: CashFlowSource): string | undefined => {
    const set = new Set(list);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    const arr = [...set];
    return arr.length > 0 ? arr.join(",") : undefined;
  };

  const activeCount =
    (search.mes && search.mes !== currentMonthKey() ? 1 : 0) +
    (filters.kind !== "mensal" ? 1 : 0) +
    (filters.direction !== "ambos" ? 1 : 0) +
    (filters.status !== "ambos" ? 1 : 0) +
    (filters.sources.length > 0 ? 1 : 0);

  return {
    filters,
    setMonth: (monthKey) => apply({ mes: monthKey === currentMonthKey() ? undefined : monthKey }),
    setKind: (kind) => apply({ periodo: kind === "mensal" ? undefined : kind }),
    setDirection: (dir) => apply({ dir }),
    setStatus: (status) => apply({ status }),
    toggleSource: (source) => apply({ origem: toggleIn(filters.sources, source) }),
    reset: () => void navigate({ search: () => ({}) }),
    activeCount,
  };
}
