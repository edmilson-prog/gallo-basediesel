/** Run-rate projection of monthly spend from partial spend so far. */
export function projectMonthlySpend(spentSoFarBRL: number, now: Date): number {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const dayOfMonth = now.getUTCDate();
  if (dayOfMonth <= 0) return spentSoFarBRL;
  return (spentSoFarBRL / dayOfMonth) * daysInMonth;
}

export type BudgetLevel = "ok" | "warning" | "critical";

export function budgetLevel(pct: number, alertThresholdPct: number): BudgetLevel {
  if (pct >= 100) return "critical";
  if (pct >= alertThresholdPct) return "warning";
  return "ok";
}
