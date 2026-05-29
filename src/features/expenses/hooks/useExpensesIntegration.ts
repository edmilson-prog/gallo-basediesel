import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IExpense, IExpenseDREAggregate } from "@/shared/types";
import { useExpensesProvider } from "@/providers/data";
import { aggregateExpensesForDRE } from "../engine";

const STALE_MS = 30_000;
const PAGE_SIZE = 1000;

/**
 * Expenses by **competence** in a window — consumed by the DRE (PRD-048 delta,
 * RF-021). Returns the raw list plus the three-line DRE aggregate.
 */
export function useExpensesByCompetence(params: {
  storeId: ID;
  startIso: string;
  endIso: string;
  enabled?: boolean;
}): { expenses: IExpense[]; aggregate: IExpenseDREAggregate; isLoading: boolean } {
  const { storeId, startIso, endIso, enabled = true } = params;
  const provider = useExpensesProvider();

  const query = useQuery({
    queryKey: ["expenses", "by-competence", storeId, startIso, endIso],
    queryFn: () =>
      provider.list({
        storeId,
        competenceStart: startIso,
        competenceEnd: endIso,
        pageSize: PAGE_SIZE,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const expenses = useMemo(() => query.data?.data ?? [], [query.data]);
  const aggregate = useMemo(
    () =>
      aggregateExpensesForDRE(expenses, new Date(startIso).getTime(), new Date(endIso).getTime()),
    [expenses, startIso, endIso],
  );

  return { expenses, aggregate, isLoading: query.isLoading };
}

/**
 * Expenses by **payment date** in a window — consumed by the Cash Flow
 * (PRD-055, RF-022). Cancelled entries never have a payment, so the provider
 * filter naturally excludes them.
 */
export function useExpensesByPayment(params: {
  storeId: ID;
  startIso: string;
  endIso: string;
  enabled?: boolean;
}): { expenses: IExpense[]; isLoading: boolean } {
  const { storeId, startIso, endIso, enabled = true } = params;
  const provider = useExpensesProvider();

  const query = useQuery({
    queryKey: ["expenses", "by-payment", storeId, startIso, endIso],
    queryFn: () =>
      provider.list({
        storeId,
        paymentStart: startIso,
        paymentEnd: endIso,
        pageSize: PAGE_SIZE,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const expenses = useMemo(
    () => (query.data?.data ?? []).filter((e) => e.status !== "cancelado"),
    [query.data],
  );

  return { expenses, isLoading: query.isLoading };
}
