import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_CASHFLOW_SETTINGS,
  type ICashFlowEntry,
  type ICashFlowSummary,
  type ID,
} from "@/shared/types";
import {
  useCashFlowProvider,
  useCommissionsProvider,
  useExpensesProvider,
  useOrdersProvider,
  useSettingsProvider,
} from "@/providers/data";
import { resolveCompetenceBounds, type ExpensePeriodKind } from "@/features/expenses/utils/period";
import { buildCashFlow, deriveCashFlowEntries, type ICashFlowEngineContext } from "../engine";

const STALE_MS = 30_000;
const PAGE_SIZE = 1000;

export interface IUseCashFlowDataResult {
  summary: ICashFlowSummary | null;
  /** Derived entries within the selected period (unfiltered by direction/status). */
  entries: ICashFlowEntry[];
  minBalanceAlert: number;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Fetch every cash source (paid/pending orders, expenses, commissions, manual
 * entries) plus settings, then run the cash flow engine for the selected
 * period (PRD-055). Exported as the consumable summary for the Cockpit (RF-028).
 */
export function useCashFlowData(params: {
  storeId: ID;
  monthKey: string;
  kind: ExpensePeriodKind;
  enabled?: boolean;
}): IUseCashFlowDataResult {
  const { storeId, monthKey, kind, enabled = true } = params;
  const ordersProvider = useOrdersProvider();
  const expensesProvider = useExpensesProvider();
  const commissionsProvider = useCommissionsProvider();
  const cashflowProvider = useCashFlowProvider();
  const settingsProvider = useSettingsProvider();

  const bounds = useMemo(() => resolveCompetenceBounds(monthKey, kind), [monthKey, kind]);

  // Wide window so the opening balance (net of everything before the period)
  // is accurate. The mock dataset only spans ~12 months.
  const since = useMemo(() => {
    const end = new Date(bounds.endIso);
    return new Date(Date.UTC(end.getUTCFullYear() - 2, end.getUTCMonth(), 1)).toISOString();
  }, [bounds.endIso]);

  const ordersQuery = useQuery({
    queryKey: ["cashflow", "orders", storeId, since, bounds.endIso],
    queryFn: () =>
      ordersProvider.list({ storeId, since, until: bounds.endIso, pageSize: PAGE_SIZE }),
    staleTime: STALE_MS,
    enabled,
  });
  const expensesQuery = useQuery({
    queryKey: ["cashflow", "expenses", storeId],
    queryFn: () => expensesProvider.list({ storeId, pageSize: PAGE_SIZE }),
    staleTime: STALE_MS,
    enabled,
  });
  const commissionsQuery = useQuery({
    queryKey: ["cashflow", "commissions", storeId],
    queryFn: () => commissionsProvider.list({ storeId, pageSize: PAGE_SIZE }),
    staleTime: STALE_MS,
    enabled,
  });
  const manualQuery = useQuery({
    queryKey: ["cashflow", "manual", storeId],
    queryFn: () => cashflowProvider.list({ storeId, pageSize: PAGE_SIZE }),
    staleTime: STALE_MS,
    enabled,
  });
  const settingsQuery = useQuery({
    queryKey: ["cashflow", "settings", storeId],
    queryFn: () => settingsProvider.get(storeId),
    staleTime: STALE_MS,
    enabled,
  });

  const orders = ordersQuery.data?.data ?? [];
  const expenses = expensesQuery.data?.data ?? [];
  const commissions = commissionsQuery.data?.data ?? [];
  const manualEntries = manualQuery.data?.data ?? [];
  const settings = settingsQuery.data ?? null;

  const cashflowSettings = settings?.cashflowSettings ?? DEFAULT_CASHFLOW_SETTINGS;

  const { summary, entries } = useMemo<{
    summary: ICashFlowSummary | null;
    entries: ICashFlowEntry[];
  }>(() => {
    if (!settings) return { summary: null, entries: [] };

    const ctx: ICashFlowEngineContext = {
      storeId,
      now: new Date(),
      baseOpeningBalance: cashflowSettings.openingBalance,
      paidOrders: orders.filter((o) => o.paymentStatus === "pago" && o.paidAt),
      paidExpenses: expenses.filter((e) => e.status === "pago" && e.paymentDate),
      paidCommissions: commissions.filter((c) => c.status === "paid" && c.paidAt),
      manualEntries,
      pendingOrders: orders.filter(
        (o) => o.paymentStatus === "pendente" || o.paymentStatus === "vencido",
      ),
      pendingExpenses: expenses.filter((e) => e.status === "pendente" || e.status === "atrasado"),
      pendingCommissions: commissions.filter(
        (c) => c.status === "calculated" || c.status === "approved",
      ),
    };

    const computed = buildCashFlow(bounds.startIso, bounds.endIso, ctx);
    const startMs = new Date(bounds.startIso).getTime();
    const endMs = new Date(bounds.endIso).getTime();
    const windowEntries = deriveCashFlowEntries(ctx)
      .filter((e) => {
        const t = new Date(e.date).getTime();
        return t >= startMs && t <= endMs;
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    return { summary: computed, entries: windowEntries };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, expenses, commissions, manualEntries, settings, bounds, storeId]);

  return {
    summary,
    entries,
    minBalanceAlert: cashflowSettings.minBalanceAlert,
    isLoading:
      ordersQuery.isLoading ||
      expensesQuery.isLoading ||
      commissionsQuery.isLoading ||
      manualQuery.isLoading ||
      settingsQuery.isLoading,
    isError:
      ordersQuery.isError ||
      expensesQuery.isError ||
      commissionsQuery.isError ||
      manualQuery.isError ||
      settingsQuery.isError,
    refetch: () => {
      void ordersQuery.refetch();
      void expensesQuery.refetch();
      void commissionsQuery.refetch();
      void manualQuery.refetch();
      void settingsQuery.refetch();
    },
  };
}

/** Cockpit-facing alias (PRD-055 RF-028 / PRD-040). */
export const useCashFlowSummary = useCashFlowData;
