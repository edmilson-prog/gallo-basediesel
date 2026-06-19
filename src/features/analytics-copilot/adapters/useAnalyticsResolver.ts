import { useMemo } from "react";
import { useAiProvider } from "@/providers/data";
import type { IQueryResolver } from "@/shared/types/analytics-copilot";
import { buildDigest } from "../catalog/buildDigest";
import { rulesResolver } from "../engine/rulesResolver";
import { toMetricQueries } from "../engine/toMetricQueries";

/**
 * Resolver that uses the LLM when 'analytics_copilot' is enabled, falling back to
 * the rule engine otherwise (off / error / empty). The number stays deterministic
 * downstream (executeQuery). Only the question + public digest reach the provider.
 */
export function useAnalyticsResolver(): IQueryResolver {
  const ai = useAiProvider();
  return useMemo<IQueryResolver>(() => {
    return async (question, ctx, catalog) => {
      let enabled = false;
      try {
        enabled = await ai.isAiFeatureEnabled("analytics_copilot");
      } catch {
        enabled = false;
      }
      if (!enabled) return rulesResolver(question, ctx, catalog);
      try {
        const resolved = await ai.resolveAnalyticsQueries(question, buildDigest(catalog));
        if (!resolved || resolved.length === 0) return rulesResolver(question, ctx, catalog);
        return { queries: toMetricQueries(resolved, ctx.period, catalog) };
      } catch {
        return rulesResolver(question, ctx, catalog);
      }
    };
  }, [ai]);
}
