import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IExpense } from "@/shared/types";
import { useExpensesProvider } from "@/providers/data";
import { resolveCompetenceBounds } from "../utils/period";
import type { IExpensesFiltersState } from "./useExpensesFilters";

const STALE_MS = 30_000;
const PAGE_SIZE = 1000;

export interface IExpensesKpis {
  /** Sum of non-cancelled amounts in the period (by competence). */
  total: number;
  paid: number;
  pending: number;
  overdue: number;
}

export interface IUseExpensesDataResult {
  expenses: IExpense[];
  kpis: IExpensesKpis;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Fetch every expense matching the active filters within the competence window
 * and derive the four header KPIs (PRD-054 RF-006). The full set is returned so
 * the table can paginate client-side over ~120 records.
 */
export function useExpensesData(params: {
  storeId: ID;
  filters: IExpensesFiltersState;
  enabled?: boolean;
}): IUseExpensesDataResult {
  const { storeId, filters, enabled = true } = params;
  const provider = useExpensesProvider();

  const bounds = useMemo(
    () => resolveCompetenceBounds(filters.monthKey, filters.kind),
    [filters.monthKey, filters.kind],
  );

  const query = useQuery({
    queryKey: [
      "expenses",
      "list",
      storeId,
      bounds.startIso,
      bounds.endIso,
      filters.categories.join(","),
      filters.statuses.join(","),
      filters.supplier,
      filters.paymentMethod ?? "",
    ],
    queryFn: () =>
      provider.list({
        storeId,
        competenceStart: bounds.startIso,
        competenceEnd: bounds.endIso,
        categories: filters.categories.length > 0 ? filters.categories : undefined,
        statuses: filters.statuses.length > 0 ? filters.statuses : undefined,
        supplier: filters.supplier || undefined,
        paymentMethod: filters.paymentMethod,
        pageSize: PAGE_SIZE,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const expenses = useMemo(() => query.data?.data ?? [], [query.data]);

  const kpis = useMemo<IExpensesKpis>(() => {
    let total = 0;
    let paid = 0;
    let pending = 0;
    let overdue = 0;
    for (const e of expenses) {
      if (e.status === "cancelado") continue;
      total += e.amount;
      if (e.status === "pago") paid += e.amount;
      else if (e.status === "pendente") pending += e.amount;
      else if (e.status === "atrasado") overdue += e.amount;
    }
    const round2 = (v: number) => Math.round(v * 100) / 100;
    return {
      total: round2(total),
      paid: round2(paid),
      pending: round2(pending),
      overdue: round2(overdue),
    };
  }, [expenses]);

  return {
    expenses,
    kpis,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
