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
 *
 * Accepts the enabled flag as a parameter so badge and resolver share the same
 * single RPC call (made at mount in useCopilotChat).
 */
export function useAnalyticsResolver(aiEnabled: boolean): IQueryResolver {
  const ai = useAiProvider();
  return useMemo<IQueryResolver>(() => {
    return async (question, ctx, catalog) => {
      if (!aiEnabled) return rulesResolver(question, ctx, catalog);
      try {
        const resolved = await ai.resolveAnalyticsQueries(question, buildDigest(catalog));
        if (!resolved || resolved.length === 0) return rulesResolver(question, ctx, catalog);
        const mapped = toMetricQueries(resolved, ctx.period, catalog);
        if (mapped.length === 0) return rulesResolver(question, ctx, catalog);
        return { queries: mapped };
      } catch {
        return rulesResolver(question, ctx, catalog);
      }
    };
  }, [ai, aiEnabled]);
}
