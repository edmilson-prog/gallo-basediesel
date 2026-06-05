import { formatBRL } from "@/shared/utils/format";
import type {
  IAnalyticsAnswer,
  IAnalyticsDataAccess,
  IMetricDefinition,
  IMetricQuery,
} from "@/shared/types/analytics-copilot";

/** Count/percentage-style metrics are formatted as plain pt-BR numbers; the rest as BRL. */
const COUNT_METRIC_KEYS = new Set(["tickets", "abc", "positivacao", "carteira"]);

function buildDrillDownUrl(panelRoute: string, query: IMetricQuery): string {
  const params = new URLSearchParams();
  if (query.filters.marca) params.set("marca", query.filters.marca);
  if (query.filters.categoria) params.set("categoria", query.filters.categoria);
  if (query.filters.vendedor) params.set("vendedor", query.filters.vendedor);
  if (query.filters.canal) params.set("canal", query.filters.canal);
  const qs = params.toString();
  return qs ? `${panelRoute}?${qs}` : panelRoute;
}

function formatMetricValue(metricKey: string, value: number): string {
  if (COUNT_METRIC_KEYS.has(metricKey)) return value.toLocaleString("pt-BR");
  return formatBRL(value);
}

type PortResult = { value: number; previousValue?: number; series?: number[] };

/**
 * Deterministic executor (RF-014, RNF-001). The value comes EXCLUSIVELY from the injected port;
 * the resolver only chose the metric/filters. Requires a scoped query (run scopeClamp first).
 */
export async function executeQuery(
  definition: IMetricDefinition,
  query: IMetricQuery,
  dataAccess: IAnalyticsDataAccess,
): Promise<IAnalyticsAnswer> {
  if (query.scope === undefined) {
    throw new Error("executeQuery requires a scoped query (run scopeClamp first).");
  }

  // Unify the port method's call signature (union of methods → one signature).
  const accessor = dataAccess[definition.dataAccessKey] as (q: IMetricQuery) => Promise<PortResult>;
  const result = await accessor(query);

  let comparison: IAnalyticsAnswer["comparison"];
  if (query.comparison && result.previousValue !== undefined) {
    const delta = result.value - result.previousValue;
    const deltaPercent = result.previousValue !== 0 ? delta / result.previousValue : 0;
    comparison = { previousValue: result.previousValue, delta, deltaPercent };
  }

  return {
    query,
    resolved: true,
    value: result.value,
    series: result.series,
    formattedValue: formatMetricValue(definition.metricKey, result.value),
    comparison,
    citation: {
      source: definition.source,
      drillDownUrl: buildDrillDownUrl(definition.source.panelRoute, query),
    },
    visual: result.series && result.series.length > 0 ? "sparkline" : "number",
  };
}

/** Honest "I don't know" answer for questions outside the catalog (RF-016). */
export function unresolvedAnswer(suggestions: string[]): IAnalyticsAnswer {
  return { resolved: false, suggestions };
}

/** Transparent refusal for out-of-scope queries (RF-013). Never carries a number. */
export function refusalAnswer(query: IMetricQuery): IAnalyticsAnswer {
  return { query, resolved: false, refusedByScope: true };
}
