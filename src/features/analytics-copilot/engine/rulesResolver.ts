import type { IGoalPeriod } from "@/shared/types/bi";
import type { IMetricDefinition, IResolvedIntent } from "@/shared/types/analytics-copilot";
import { resolveQuery } from "./resolveQuery";

/** Wraps the rule-based resolveQuery into the IResolvedIntent contract (single query or ambiguous). */
export function rulesResolver(
  question: string,
  ctx: { period: IGoalPeriod },
  catalog: IMetricDefinition[],
): IResolvedIntent {
  const r = resolveQuery(question, { period: ctx.period }, catalog);
  return { queries: r.query ? [r.query] : [], ambiguous: r.ambiguous, candidates: r.candidates };
}
