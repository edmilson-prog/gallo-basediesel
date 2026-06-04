import { useCallback, useState } from "react";

import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { auditLog, useCurrentRole } from "@/features/rbac";
import type { IGoalPeriod } from "@/shared/types/bi";
import type { IAnalyticsAnswer, IAnalyticsMessage } from "@/shared/types/analytics-copilot";

import {
  executeQuery,
  findMetricById,
  metricCatalog,
  refusalAnswer,
  resolveQuery,
  scopeClamp,
  unresolvedAnswer,
} from "..";
import { useAnalyticsDataAccess } from "../adapters/useAnalyticsDataAccess";

export interface IUseAnalyticsCopilotResult {
  messages: IAnalyticsMessage[];
  isThinking: boolean;
  ask: (question: string) => Promise<void>;
  reset: () => void;
}

/** Calendar-month bounds for "this period" (local time, no @/mocks dependency). */
function monthBounds(date: Date): IGoalPeriod {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { type: "monthly", start: start.toISOString(), end: end.toISOString() };
}

/**
 * Suggested questions surfaced when a question can't be resolved (RF-016).
 * Vendedor sees own-scope phrasings; everyone else the manager set.
 */
function fallbackSuggestions(role: ReturnType<typeof useCurrentRole>): string[] {
  if (role === "Vendedor") {
    return ["Quanto faturei esse mês?", "Meu ticket médio", "Minha positivação"];
  }
  return [
    "Quanto faturei esse mês?",
    "Qual a margem esse mês?",
    "Quantos clientes em risco?",
    "Faturamento de Volvo esse mês",
  ];
}

function makeMessage(partial: Omit<IAnalyticsMessage, "id" | "timestamp">): IAnalyticsMessage {
  return { ...partial, id: crypto.randomUUID(), timestamp: new Date().toISOString() };
}

/**
 * Session orchestration for the analytics copilot (PRD-057). Holds in-memory
 * chat state and exposes `ask()` = resolveQuery → scopeClamp → executeQuery.
 *
 * RNF-001: the number always comes from the data-access port (pure BI engines);
 * the resolver only selects metric + filters, never a value.
 */
export function useAnalyticsCopilot(): IUseAnalyticsCopilotResult {
  const dataAccess = useAnalyticsDataAccess();
  const role = useCurrentRole();
  const { currentStoreId } = useCurrentStore();
  const { currentUser } = useAuth();

  const [messages, setMessages] = useState<IAnalyticsMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);

  const ask = useCallback(
    async (question: string): Promise<void> => {
      const trimmed = question.trim();
      if (!trimmed) return;

      setMessages((prev) => [...prev, makeMessage({ role: "user", text: trimmed })]);
      setIsThinking(true);

      let answer: IAnalyticsAnswer;
      let errorText: string | undefined;
      try {
        const period = monthBounds(new Date());
        const r = resolveQuery(trimmed, { period }, metricCatalog);

        if (r.query === null) {
          answer = r.ambiguous
            ? {
                resolved: false,
                ambiguous: true,
                suggestions: r.candidates.map((id) => findMetricById(id)?.label ?? id),
              }
            : unresolvedAnswer(fallbackSuggestions(role));
        } else {
          const effectiveRole = role ?? "Vendedor";
          const sellerId = effectiveRole === "Vendedor" ? currentUser?.id : undefined;
          const clamp = scopeClamp(r.query, {
            role: effectiveRole,
            storeId: currentStoreId ?? undefined,
            sellerId,
          });
          if (clamp.refusedByScope) {
            answer = refusalAnswer(clamp.query);
          } else {
            const def = findMetricById(clamp.query.metricId)!;
            answer = await executeQuery(def, clamp.query, dataAccess);
            auditLog({
              action: "analytics_copilot_query",
              resource: "insight",
              resourceId: def.id,
              storeId: currentStoreId ?? undefined,
            });
          }
        }
      } catch {
        // Never throw out of ask — surface a friendly, retryable error answer.
        answer = { resolved: false, suggestions: fallbackSuggestions(role) };
        errorText = "Não consegui responder agora. Tente novamente.";
      }

      setMessages((prev) => [...prev, makeMessage({ role: "assistant", answer, text: errorText })]);
      setIsThinking(false);
    },
    [dataAccess, role, currentStoreId, currentUser],
  );

  const reset = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, isThinking, ask, reset };
}
