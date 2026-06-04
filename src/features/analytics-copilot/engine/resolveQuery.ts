import { BRAND_ALIASES_FLAT } from "@/features/part-identification/data/brands";
import { PART_CATEGORY_ENTRIES } from "@/features/part-identification/data/partCategories";
import type { IGoalPeriod } from "@/shared/types/bi";
import type {
  ComparisonMode,
  IMetricDefinition,
  IMetricQuery,
  MetricDimension,
} from "@/shared/types/analytics-copilot";

export interface IResolveContext {
  /** Current period used when the question implies "this period". */
  period: IGoalPeriod;
}

export interface IResolveResult {
  query: IMetricQuery | null;
  ambiguous: boolean;
  /** Metric ids that matched (for disambiguation chips). */
  candidates: string[];
}

/** Lowercase + strip diacritics so "Volvo"/"vólvo"/"VOLVO" all match. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function matchMetrics(normalized: string, catalog: IMetricDefinition[]): IMetricDefinition[] {
  return catalog.filter((m) => m.keywords.some((kw) => normalized.includes(normalize(kw))));
}

function extractBrand(normalized: string): string | undefined {
  for (const { alias, canonical } of BRAND_ALIASES_FLAT) {
    if (normalized.includes(normalize(alias))) return canonical;
  }
  return undefined;
}

function extractCategory(normalized: string): string | undefined {
  for (const entry of PART_CATEGORY_ENTRIES) {
    if (entry.keywords.some((kw) => normalized.includes(normalize(kw)))) return entry.canonical;
  }
  return undefined;
}

function extractComparison(normalized: string): ComparisonMode | undefined {
  if (
    normalized.includes("vs") ||
    normalized.includes("comparado") ||
    normalized.includes("mes passado") ||
    normalized.includes("mes anterior")
  ) {
    return "previous_period";
  }
  if (normalized.includes("ano passado") || normalized.includes("ano anterior")) {
    return "previous_year";
  }
  return undefined;
}

/**
 * Pure intent resolver (RF-009). Maps a natural-language question to a structured IMetricQuery,
 * or null when outside the catalog (RF-016) or ambiguous (RF-011). Never produces a number.
 */
export function resolveQuery(
  question: string,
  context: IResolveContext,
  catalog: IMetricDefinition[],
): IResolveResult {
  const normalized = normalize(question);
  const matched = matchMetrics(normalized, catalog);

  if (matched.length === 0) {
    return { query: null, ambiguous: false, candidates: [] };
  }
  if (matched.length > 1) {
    return { query: null, ambiguous: true, candidates: matched.map((m) => m.id) };
  }

  const metric = matched[0]!;
  const filters: Partial<Record<MetricDimension, string>> = {};

  const brand = extractBrand(normalized);
  if (brand && metric.supportedFilters.includes("marca")) filters.marca = brand;

  const category = extractCategory(normalized);
  if (category && metric.supportedFilters.includes("categoria")) filters.categoria = category;

  const query: IMetricQuery = {
    metricId: metric.id,
    dimensions: [],
    filters,
    period: context.period,
    comparison: extractComparison(normalized),
  };
  return { query, ambiguous: false, candidates: [metric.id] };
}
