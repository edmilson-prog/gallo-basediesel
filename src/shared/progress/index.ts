import type { GoalProgressStatus, GoalProgressTrend, ISO8601 } from "@/shared/types";

/**
 * Traffic-light status from attainment vs. expected-by-date pace.
 * Extracted from the goals engine so goals and indicators share one rule.
 */
export function statusFromRatio(percentage: number, daysRatio: number): GoalProgressStatus {
  if (percentage >= 100) return "concluida";
  const expected = daysRatio * 100;
  if (expected <= 0) return "no_caminho";
  const ratio = percentage / expected;
  if (ratio >= 1.0) return "no_caminho";
  if (ratio >= 0.7) return "atencao";
  return "atrasada";
}

/** One contribution sample: a timestamp and the value realized at it. */
export interface IProgressSample {
  ts: ISO8601;
  value: number;
}

/**
 * Trend over the period: compares the value realized in the first half of the
 * elapsed window against the second half. Generic over the value being summed.
 *
 * Callers must pass PER-EVENT samples already filtered to the period:
 * for additive metrics (revenue, margin) pass the monetary value; for
 * count metrics (order count, distinct customers) pass 1 per contributing event.
 * Do not pass a single running-total sample.
 */
export function computeWindowedTrend(
  samples: IProgressSample[],
  fromIso: string,
  now: Date,
): GoalProgressTrend {
  const half = new Date((new Date(fromIso).getTime() + now.getTime()) / 2).toISOString();
  let firstHalf = 0;
  let secondHalf = 0;
  for (const s of samples) {
    if (s.ts < half) firstHalf += s.value;
    else secondHalf += s.value;
  }
  if (firstHalf === 0 && secondHalf === 0) return "estavel";
  if (firstHalf === 0) return "subindo";
  const diff = (secondHalf - firstHalf) / firstHalf;
  if (diff > 0.1) return "subindo";
  if (diff < -0.1) return "caindo";
  return "estavel";
}
