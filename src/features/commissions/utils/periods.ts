/**
 * Period helpers for the commissions feature (`YYYY-MM` references).
 */

export function currentPeriod(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function previousPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
}

export function periodStartIso(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1, 0, 0, 0)).toISOString();
}

export function periodEndIso(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)).toISOString();
}

const MONTHS_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function labelForPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return `${MONTHS_PT[m - 1]} ${y}`;
}

/**
 * Whether a monthly close button can be displayed for `period`.
 * The PRD asks for "after the 1st of the next month". We allow as soon as the
 * period ended (i.e. `now > periodEnd`).
 */
export function canClosePeriod(period: string, now: Date = new Date()): boolean {
  return now.toISOString() > periodEndIso(period);
}
