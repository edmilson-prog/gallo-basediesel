// src/features/analytics-copilot/engine/runCopilotQuery.ts
import type { IGoalPeriod } from "@/shared/types/bi";
import type { RoleName } from "@/shared/types/people";
import type {
  IAnalyticsAnswer,
  IAnalyticsDataAccess,
  IMetricDefinition,
} from "@/shared/types/analytics-copilot";

import { resolveQuery } from "./resolveQuery";
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
}

export interface IRunCopilotResult {
  answer: IAnalyticsAnswer;
  errorText?: string;
}

/**
 * Pure orchestration of a copilot question (PRD-057): resolveQuery → scopeClamp → executeQuery.
 * RNF-001: the number always comes from `deps.dataAccess`; the resolver only selects
 * metric + filters. Never throws — failures become a friendly, retryable answer.
 */
export async function runCopilotQuery(
  question: string,
  ctx: IRunCopilotContext,
  deps: IRunCopilotDeps,
): Promise<IRunCopilotResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    return { answer: unresolvedAnswer(ctx.fallbackSuggestions) };
  }

  const findById = (id: string): IMetricDefinition | undefined =>
    deps.catalog.find((m) => m.id === id);

  try {
    const r = resolveQuery(trimmed, { period: ctx.period }, deps.catalog);

    if (r.query === null) {
      if (r.ambiguous) {
        return {
          answer: {
            resolved: false,
            ambiguous: true,
            suggestions: r.candidates.map((id) => findById(id)?.label ?? id),
          },
        };
      }
      return { answer: unresolvedAnswer(ctx.fallbackSuggestions) };
    }

    const clamp = scopeClamp(r.query, {
      role: ctx.role,
      storeId: ctx.storeId,
      sellerId: ctx.sellerId,
    });
    if (clamp.refusedByScope) {
      return { answer: refusalAnswer(clamp.query) };
    }

    const def = findById(clamp.query.metricId);
    if (!def) {
      return { answer: unresolvedAnswer(ctx.fallbackSuggestions) };
    }
    const answer = await executeQuery(def, clamp.query, deps.dataAccess);
    return { answer };
  } catch {
    return {
      answer: { resolved: false, suggestions: ctx.fallbackSuggestions },
      errorText: "Não consegui responder agora. Tente novamente.",
    };
  }
}
