import type { INpsMonthlyPoint, INpsResponsePoint } from "@/shared/types";
import { computeNps } from "./computeNps";

/**
 * Groups answers into calendar months for the trend chart.
 *
 * Each month carries its own N and obeys the same honesty rule as the headline
 * score: a month below `minResponses` reports its counts but a null score, so
 * the line breaks instead of drawing a confident spike off three answers.
 *
 * Months are emitted in ascending order and only for months that have data —
 * the caller decides how to render gaps, since a chart and a table want
 * different things from an empty month.
 */
export function aggregateMonthly(
  responses: ReadonlyArray<INpsResponsePoint>,
  opts: { minResponses: number },
): INpsMonthlyPoint[] {
  const buckets = new Map<string, INpsResponsePoint[]>();

  for (const response of responses) {
    const month = response.respondedAt.slice(0, 7); // 'YYYY-MM' from ISO
    const bucket = buckets.get(month);
    if (bucket) bucket.push(response);
    else buckets.set(month, [response]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, monthResponses]) => {
      const result = computeNps(monthResponses, {
        minResponses: opts.minResponses,
        sent: monthResponses.length,
      });
      return {
        month,
        score: result.score,
        promoters: result.promoters,
        passives: result.passives,
        detractors: result.detractors,
        n: result.n,
      };
    });
}
