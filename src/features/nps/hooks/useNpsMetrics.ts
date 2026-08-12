import { useQuery } from "@tanstack/react-query";
import { useNpsProvider } from "@/providers/data";
import type { INpsFilters, INpsMonthlyPoint, INpsResult } from "@/shared/types";
import { aggregateMonthly, computeNps } from "../engine";

/**
 * Default honest minimum. Mirrors `nps_settings.min_responses_for_score`; the
 * settings screen passes the store's own value once it exists, and until then
 * every surface agrees on this number rather than each picking its own.
 */
export const DEFAULT_MIN_RESPONSES = 5;

export interface INpsMetricsResult extends INpsResult {
  monthly: INpsMonthlyPoint[];
  /** Score of the preceding window of equal length, or null while collecting. */
  previousScore: number | null;
  /** Point difference against the previous window; null when either side lacks N. */
  delta: number | null;
  minResponses: number;
}

/**
 * Reads the NPS of a window and turns it into a score.
 *
 * The provider returns raw answers and the arithmetic happens here, so the
 * "no score without N" rule has exactly one implementation — the Cockpit card,
 * this page and the customer fiche cannot drift apart on what counts as enough
 * data.
 */
export function useNpsMetrics(filters: INpsFilters, opts: { minResponses?: number } = {}) {
  const provider = useNpsProvider();
  const minResponses = opts.minResponses ?? DEFAULT_MIN_RESPONSES;

  return useQuery({
    // Ids only in the key — never the filter object, which would be a new
    // reference on every render and quietly defeat the cache.
    queryKey: [
      "nps",
      "metrics",
      filters.storeId ?? "all",
      filters.windowDays,
      filters.trigger ?? "any",
      filters.audience ?? "any",
      minResponses,
    ],
    queryFn: async (): Promise<INpsMetricsResult> => {
      const raw = await provider.rawMetrics(filters);

      const current = computeNps(raw.responses, { minResponses, sent: raw.sent });
      const previous = computeNps(raw.previousResponses, {
        minResponses,
        sent: raw.previousSent,
      });

      return {
        ...current,
        monthly: aggregateMonthly(raw.responses, { minResponses }),
        previousScore: previous.score,
        delta:
          current.score !== null && previous.score !== null ? current.score - previous.score : null,
        minResponses,
      };
    },
  });
}
