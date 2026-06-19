import { BRANDS } from "@/features/part-identification/data/brands";
import { PART_CATEGORY_ENTRIES } from "@/features/part-identification/data/partCategories";
import type { IAnalyticsDigest, IMetricDefinition } from "@/shared/types/analytics-copilot";

/** Builds the public digest sent to the LLM resolver. Metadata only — no numbers/PII. */
export function buildDigest(catalog: IMetricDefinition[]): IAnalyticsDigest {
  return {
    catalog: catalog.map((m) => ({
      id: m.id,
      label: m.label,
      description: m.description,
      supportedFilters: m.supportedFilters,
    })),
    brands: BRANDS.map((b) => b.canonical),
    categories: PART_CATEGORY_ENTRIES.map((c) => c.canonical),
  };
}
