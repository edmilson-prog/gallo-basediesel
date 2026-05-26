import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ID, SdrEscalationReason, SdrFinishReason } from "@/shared/types";

export interface ISdrHistoryFiltersState {
  finishReasons: SdrFinishReason[];
  escalationReason: SdrEscalationReason | "all";
  sellerId: ID | "all";
  hasQuote: "all" | "yes" | "no";
  page: number;
}

const VALID_FINISH = new Set<SdrFinishReason>([
  "completed",
  "escalated",
  "abandoned",
  "paused_by_human",
]);

const VALID_ESCALATION = new Set<SdrEscalationReason>([
  "customer_requested",
  "negotiation_detected",
  "sdr_failed",
  "complexity",
  "out_of_scope",
]);

interface IRawSearch {
  estado?: string | string[];
  motivo?: string;
  vendedor?: string;
  quote?: string;
  pagina?: string | number;
}

function parseFinishReasons(value: IRawSearch["estado"]): SdrFinishReason[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : value.split(",");
  return raw.filter((v): v is SdrFinishReason => VALID_FINISH.has(v as SdrFinishReason));
}

function readState(search: IRawSearch): ISdrHistoryFiltersState {
  const escalation =
    typeof search.motivo === "string" && VALID_ESCALATION.has(search.motivo as SdrEscalationReason)
      ? (search.motivo as SdrEscalationReason)
      : "all";
  const hasQuote: ISdrHistoryFiltersState["hasQuote"] =
    search.quote === "yes" ? "yes" : search.quote === "no" ? "no" : "all";
  const page = typeof search.pagina === "number" ? search.pagina : Number(search.pagina ?? 1);
  return {
    finishReasons: parseFinishReasons(search.estado),
    escalationReason: escalation,
    sellerId: search.vendedor ?? "all",
    hasQuote,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
  };
}

export interface IUseSdrHistoryFilters {
  filters: ISdrHistoryFiltersState;
  toggleFinishReason: (reason: SdrFinishReason) => void;
  setEscalationReason: (reason: SdrEscalationReason | "all") => void;
  setSellerId: (id: ID | "all") => void;
  setHasQuote: (value: "all" | "yes" | "no") => void;
  setPage: (page: number) => void;
  reset: () => void;
}

export function useSdrHistoryFilters(): IUseSdrHistoryFilters {
  const search = useSearch({ from: "/app/sdr" }) as IRawSearch;
  const navigate = useNavigate({ from: "/app/sdr" });
  const filters = useMemo(() => readState(search), [search]);

  const apply = useCallback(
    (patch: Partial<IRawSearch>) => {
      void navigate({
        search: (prev) => {
          const next: IRawSearch = { ...(prev as IRawSearch), ...patch };
          for (const key of Object.keys(next) as (keyof IRawSearch)[]) {
            const value = next[key];
            if (value === undefined || value === "" || value === null) delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  const toggleFinishReason = useCallback(
    (reason: SdrFinishReason) => {
      const set = new Set(filters.finishReasons);
      if (set.has(reason)) set.delete(reason);
      else set.add(reason);
      const list = [...set];
      apply({ estado: list.length > 0 ? list.join(",") : undefined, pagina: undefined });
    },
    [apply, filters.finishReasons],
  );

  return {
    filters,
    toggleFinishReason,
    setEscalationReason: (reason) =>
      apply({ motivo: reason === "all" ? undefined : reason, pagina: undefined }),
    setSellerId: (id) =>
      apply({ vendedor: id === "all" ? undefined : id, pagina: undefined }),
    setHasQuote: (value) =>
      apply({ quote: value === "all" ? undefined : value, pagina: undefined }),
    setPage: (page) => apply({ pagina: page === 1 ? undefined : String(page) }),
    reset: () =>
      apply({
        estado: undefined,
        motivo: undefined,
        vendedor: undefined,
        quote: undefined,
        pagina: undefined,
      }),
  };
}
