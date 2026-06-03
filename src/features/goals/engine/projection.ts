import type { ISO8601 } from "@/shared/types";

const DAY_MS = 24 * 3600_000;

export interface IPeriodWindow {
  totalDays: number;
  daysPassed: number;
  daysRemaining: number;
  daysRatio: number;
}

/**
 * Slice the period into total / passed / remaining day counts.
 * `now` defaults to wall-clock; injectable for testability and memo stability.
 */
export function describePeriodWindow(
  period: { start: ISO8601; end: ISO8601 },
  now: Date = new Date(),
): IPeriodWindow {
  const start = new Date(period.start).getTime();
  const end = new Date(period.end).getTime();
  const totalDays = Math.max(1, Math.round((end - start) / DAY_MS));
  const elapsedMs = Math.max(0, now.getTime() - start);
  const daysPassed = Math.max(0, Math.min(totalDays, Math.round(elapsedMs / DAY_MS)));
  const daysRemaining = Math.max(0, totalDays - daysPassed);
  const daysRatio = totalDays > 0 ? daysPassed / totalDays : 0;
  return { totalDays, daysPassed, daysRemaining, daysRatio };
}

/**
 * Linear projection of the final value if the current pace holds.
 * Capped at 200% of target so absurd extrapolations don't dominate charts.
 */
export function computeProjection(
  currentValue: number,
  daysPassed: number,
  totalDays: number,
  targetValue: number,
): number {
  if (daysPassed <= 0) return currentValue;
  const projected = currentValue * (totalDays / daysPassed);
  const cap = targetValue * 2;
  return Math.min(projected, cap);
}
