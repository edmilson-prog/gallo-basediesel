import type { IGoalPeriod } from "@/shared/types/bi";
import type {
  IMetricDefinition,
  IMetricQuery,
  IResolvedQuery,
  MetricDimension,
} from "@/shared/types/analytics-copilot";

const ALLOWED_FILTERS: MetricDimension[] = ["marca", "categoria"];

/**
 * Maps LLM-resolved intents to executable IMetricQuery[] (front-side revalidation,
 * defence in depth over the Edge). Drops unknown metrics and unsupported filters;
 * injects the period from context. RNF-001: never produces a number.
 */
export function toMetricQueries(
  resolved: IResolvedQuery[],
  period: IGoalPeriod,
  catalog: IMetricDefinition[],
): IMetricQuery[] {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const out: IMetricQuery[] = [];
  for (const r of resolved) {
    const def = byId.get(r.metricId);
    if (!def) continue;
    const filters: Partial<Record<MetricDimension, string>> = {};
    for (const k of ALLOWED_FILTERS) {
      const v = r.filters[k];
      if (v && def.supportedFilters.includes(k)) filters[k] = v;
    }
    out.push({ metricId: def.id, dimensions: [], filters, period, comparison: r.comparison });
  }
  return out;
}
