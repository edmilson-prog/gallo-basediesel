import type { ID, ISO8601 } from "./common";
import type { IGoalPeriod } from "./bi";
import type { RoleName } from "./people";

/** Dimensions a question can slice a metric by. */
export type MetricDimension =
  | "vendedor"
  | "canal"
  | "categoria"
  | "marca"
  | "cliente"
  | "loja"
  | "tempo";

export type ComparisonMode = "previous_period" | "previous_year";

export interface IMetricSource {
  prd: string;
  panelRoute: string;
  label: string;
}

export interface IMetricQueryScope {
  storeId?: ID;
  sellerId?: ID;
  role: RoleName;
}

export interface IMetricQuery {
  metricId: string;
  dimensions: MetricDimension[];
  filters: Partial<Record<MetricDimension, string>>;
  period: IGoalPeriod;
  comparison?: ComparisonMode;
  /** Filled by scopeClamp before execution. */
  scope?: IMetricQueryScope;
}

/**
 * Deterministic data-access port — the ONLY dependency of executeQuery (RNF-001).
 * Each method returns a number already computed by the BI engines. In tests, a stub
 * provides canned values; in the app (surface phase), a thin adapter wires these to
 * useSalesAnalytics / useProfitabilityData / usePositivationMetrics / useABCClassification /
 * usePortfolioMetrics / useForecast.
 */
export interface IAnalyticsDataAccess {
  getSalesMetric(
    query: IMetricQuery,
  ): Promise<{ value: number; previousValue?: number; series?: number[] }>;
  getMargin(query: IMetricQuery): Promise<{ value: number; previousValue?: number }>;
  getPositivation(query: IMetricQuery): Promise<{ value: number; previousValue?: number }>;
  getABCClass(query: IMetricQuery): Promise<{ value: number; series?: number[] }>;
  getPortfolioStatus(query: IMetricQuery): Promise<{ value: number }>;
  getForecast(query: IMetricQuery): Promise<{ value: number }>;
}

export type AnalyticsDataAccessKey = keyof IAnalyticsDataAccess;

export interface IMetricDefinition {
  id: string;
  label: string;
  description: string;
  /** Aligned to the existing vocabulary (GoalMetric/IndicatorMetric where applicable). */
  metricKey: string;
  dimensions: MetricDimension[];
  supportedFilters: MetricDimension[];
  /** Synonyms used by the mock resolver. */
  keywords: string[];
  source: IMetricSource;
  requiredRole?: RoleName;
  /** Maps the metric to its executor method on the port. */
  dataAccessKey: AnalyticsDataAccessKey;
}

export interface IAnalyticsCitation {
  source: IMetricSource;
  drillDownUrl: string;
}

export interface IAnalyticsComparison {
  previousValue: number;
  delta: number;
  deltaPercent: number;
}

export type AnalyticsVisualType = "none" | "sparkline" | "number";

export interface IAnalyticsAnswer {
  query?: IMetricQuery;
  resolved: boolean;
  value?: number;
  series?: number[];
  formattedValue?: string;
  comparison?: IAnalyticsComparison;
  citation?: IAnalyticsCitation;
  visual?: AnalyticsVisualType;
  refusedByScope?: boolean;
  ambiguous?: boolean;
  suggestions?: string[];
}

export interface IAnalyticsMessage {
  id: ID;
  role: "user" | "assistant";
  text?: string;
  answer?: IAnalyticsAnswer;
  timestamp: ISO8601;
}

export interface IAnalyticsSession {
  id: ID;
  messages: IAnalyticsMessage[];
}

export interface IAnalyticsCopilotContext {
  storeId?: ID;
  sellerId?: ID;
  role: RoleName;
  now: ISO8601;
}

/** A metric intent resolved from a question (period is added later by the caller). */
export interface IResolvedQuery {
  metricId: string;
  filters: Partial<Record<MetricDimension, string>>;
  comparison?: ComparisonMode;
}

/** Public catalog metadata sent to the LLM resolver (NO numbers / PII). */
export interface IAnalyticsDigest {
  catalog: Array<{
    id: string;
    label: string;
    description: string;
    supportedFilters: MetricDimension[];
  }>;
  brands: string[];
  categories: string[];
}

/** Output of a query resolver: 0+ executable queries, plus the rules-only ambiguous case. */
export interface IResolvedIntent {
  queries: IMetricQuery[];
  ambiguous?: boolean;
  candidates?: string[];
}

/** Pluggable resolver (rules or LLM). Sync (rules) or async (LLM). */
export type IQueryResolver = (
  question: string,
  ctx: { period: IGoalPeriod },
  catalog: IMetricDefinition[],
) => Promise<IResolvedIntent> | IResolvedIntent;

/** Provider contract (mock in Fase 1; LLM resolver swap in Fase 2). Implemented in the surface phase. */
export interface IAnalyticsCopilotProvider {
  ask(question: string, context: IAnalyticsCopilotContext): Promise<IAnalyticsAnswer>;
}
