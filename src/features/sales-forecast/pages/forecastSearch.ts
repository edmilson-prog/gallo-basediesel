import type { ForecastMetric } from "@/shared/types/forecast";

export interface IForecastSearch {
  metric: ForecastMetric;
}

/**
 * Lightweight URL-search validation for the forecast page (PRD-056). Mirrors the
 * `validate*Search` convention used elsewhere: it never throws, just coerces the
 * raw search into a known-good shape, defaulting the metric to "revenue".
 */
export function validateForecastSearch(search: Record<string, unknown>): IForecastSearch {
  return { metric: search.metric === "tickets" ? "tickets" : "revenue" };
}
