// src/features/analytics-copilot/engine/runCopilotQuery.ts
import type { IGoalPeriod } from "@/shared/types/bi";
import type { RoleName } from "@/shared/types/people";
import type {
  IAnalyticsAnswer,
  IAnalyticsDataAccess,
  IMetricDefinition,
  IQueryResolver,
} from "@/shared/types/analytics-copilot";

import { rulesResolver } from "./rulesResolver";
import { scopeClamp } from "./scopeClamp";
import { executeQuery, refusalAnswer, unresolvedAnswer } from "./executeQuery";

export interface IRunCopilotContext {
  role: RoleName;
  storeId?: string;
  sellerId?: string;
  period: IGoalPeriod;
  /** Surfaced when a question can't be resolved (RF-016). */
  fallbackSuggestions: string[];
}

export interface IRunCopilotDeps {
  dataAccess: IAnalyticsDataAccess;
  catalog: IMetricDefinition[];
  /** Pluggable resolver (default: rule-based). The LLM path is injected by the hook. */
  resolver?: IQueryResolver;
}

export interface IRunCopilotResult {
  answers: IAnalyticsAnswer[];
  errorText?: string;
}

/**
 * Orchestrates a copilot question (PRD-057): resolver → scopeClamp → executeQuery, per metric.
 * RNF-001: the number always comes from dataAccess; the resolver only selects metric + filters.
 * Returns one answer per resolved metric (multi-card). Never throws.
 */
export async function runCopilotQuery(
  question: string,
  ctx: IRunCopilotContext,
  deps: IRunCopilotDeps,
): Promise<IRunCopilotResult> {
  const trimmed = question.trim();
  if (!trimmed) return { answers: [unresolvedAnswer(ctx.fallbackSuggestions)] };

  const findById = (id: string): IMetricDefinition | undefined =>
    deps.catalog.find((m) => m.id === id);
  const resolver = deps.resolver ?? rulesResolver;

  try {
    const intent = await resolver(trimmed, { period: ctx.period }, deps.catalog);

    if (intent.queries.length === 0) {
      if (intent.ambiguous) {
        return {
          answers: [
            {
              resolved: false,
              ambiguous: true,
              suggestions: (intent.candidates ?? []).map((id) => findById(id)?.label ?? id),
            },
          ],
        };
      }
      return { answers: [unresolvedAnswer(ctx.fallbackSuggestions)] };
    }

    const answers: IAnalyticsAnswer[] = [];
    for (const q of intent.queries) {
      const clamp = scopeClamp(q, { role: ctx.role, storeId: ctx.storeId, sellerId: ctx.sellerId });
      if (clamp.refusedByScope) {
        answers.push(refusalAnswer(clamp.query));
        continue;
      }
      const def = findById(clamp.query.metricId);
      if (!def) {
        answers.push(unresolvedAnswer(ctx.fallbackSuggestions));
        continue;
      }
      answers.push(await executeQuery(def, clamp.query, deps.dataAccess));
    }
    return { answers };
  } catch {
    return {
      answers: [{ resolved: false, suggestions: ctx.fallbackSuggestions }],
      errorText: "Não consegui responder agora. Tente novamente.",
    };
  }
}
