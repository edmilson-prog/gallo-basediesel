// src/features/analytics-copilot/hooks/useCopilotChat.ts
import { useCallback, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { auditLog, useCurrentRole } from "@/features/rbac";
import type { IGoalPeriod } from "@/shared/types/bi";
import type { IAnalyticsAnswer, IAnalyticsMessage } from "@/shared/types/analytics-copilot";

import { metricCatalog } from "../catalog/metricCatalog";
import { runCopilotQuery } from "../engine/runCopilotQuery";
import { useAnalyticsDataAccess } from "../adapters/useAnalyticsDataAccess";
import { suggestionsForRole } from "../i18n/suggestions";
import { useCopilotSessions } from "./useCopilotSessions";
import type { ICopilotSessionRecord } from "../engine/sessionStore";

/** Calendar-month bounds for "this period" (local time). */
function monthBounds(date: Date): IGoalPeriod {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { type: "monthly", start: start.toISOString(), end: end.toISOString() };
}

function makeMessage(partial: Omit<IAnalyticsMessage, "id" | "timestamp">): IAnalyticsMessage {
  return { ...partial, id: crypto.randomUUID(), timestamp: new Date().toISOString() };
}

/** Last assistant message whose answer is resolved (drives the Split detail panel). */
function lastResolved(messages: IAnalyticsMessage[]): IAnalyticsAnswer | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "assistant" && m.answer?.resolved) return m.answer;
  }
  return null;
}

export interface IUseCopilotChat {
  sessions: ICopilotSessionRecord[];
  activeSessionId: string;
  messages: IAnalyticsMessage[];
  isThinking: boolean;
  lastResolvedAnswer: IAnalyticsAnswer | null;
  ask: (question: string) => Promise<void>;
  newSession: () => void;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
}

/**
 * Session-aware orchestration for the copilot page (PRD-057 surface, multi-mode).
 * RNF-001: the number comes only from runCopilotQuery → executeQuery → dataAccess.
 */
export function useCopilotChat(): IUseCopilotChat {
  const dataAccess = useAnalyticsDataAccess();
  const role = useCurrentRole();
  const { currentStoreId } = useCurrentStore();
  const { currentUser } = useAuth();
  const {
    sessions,
    activeSession,
    activeSessionId,
    newSession,
    selectSession,
    deleteSession,
    appendToActive,
  } = useCopilotSessions();

  const [isThinking, setIsThinking] = useState(false);

  const messages = activeSession.messages;
  const lastResolvedAnswer = useMemo(() => lastResolved(messages), [messages]);

  const ask = useCallback(
    async (question: string): Promise<void> => {
      const trimmed = question.trim();
      if (!trimmed) return;

      appendToActive([makeMessage({ role: "user", text: trimmed })]);
      setIsThinking(true);

      const effectiveRole = role ?? "Vendedor";
      const sellerId = effectiveRole === "Vendedor" ? currentUser?.id : undefined;
      const { answer, errorText } = await runCopilotQuery(
        trimmed,
        {
          role: effectiveRole,
          storeId: currentStoreId ?? undefined,
          sellerId,
          period: monthBounds(new Date()),
          fallbackSuggestions: suggestionsForRole(role),
        },
        { dataAccess, catalog: metricCatalog },
      );

      if (answer.resolved && answer.query) {
        auditLog({
          action: "analytics_copilot_query",
          resource: "insight",
          resourceId: answer.query.metricId,
          storeId: currentStoreId ?? undefined,
        });
      }

      appendToActive([makeMessage({ role: "assistant", answer, text: errorText })]);
      setIsThinking(false);
    },
    [appendToActive, dataAccess, role, currentStoreId, currentUser],
  );

  return {
    sessions,
    activeSessionId,
    messages,
    isThinking,
    lastResolvedAnswer,
    ask,
    newSession,
    selectSession,
    deleteSession,
  };
}
