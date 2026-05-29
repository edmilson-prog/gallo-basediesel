import type { IExpense, IExpenseDREAggregate } from "@/shared/types";
import { EXPENSE_CATEGORY_TO_DRE_LINE } from "@/shared/types";

const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * Aggregate expenses into the three DRE operating-expense lines (PRD-054
 * RF-023), summing by **competence** within `[startMs, endMs]`.
 *
 * Cancelled expenses are ignored. Commissions are NOT included here — the DRE
 * sources them from PRD-047 on its own channel.
 *
 * Pure + deterministic so the DRE engine can call it for every sub-period
 * (current / previous / year-ago / 12-month trend) without extra I/O.
 */
export function aggregateExpensesForDRE(
  expenses: IExpense[],
  startMs: number,
  endMs: number,
): IExpenseDREAggregate {
  const acc: IExpenseDREAggregate = { payroll: 0, rentInfra: 0, otherExpenses: 0 };
  for (const e of expenses) {
    if (e.status === "cancelado") continue;
    const t = new Date(e.competenceDate).getTime();
    if (Number.isNaN(t) || t < startMs || t > endMs) continue;
    const line = EXPENSE_CATEGORY_TO_DRE_LINE[e.category];
    acc[line] += e.amount;
  }
  return {
    payroll: round2(acc.payroll),
    rentInfra: round2(acc.rentInfra),
    otherExpenses: round2(acc.otherExpenses),
  };
}
