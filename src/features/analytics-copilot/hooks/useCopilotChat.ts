// src/features/analytics-copilot/hooks/useCopilotChat.ts
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { auditLog, useCurrentRole } from "@/features/rbac";
import type { IGoalPeriod } from "@/shared/types/bi";
import type { IAnalyticsAnswer, IAnalyticsMessage } from "@/shared/types/analytics-copilot";

import { metricCatalog } from "../catalog/metricCatalog";
import { runCopilotQuery } from "../engine/runCopilotQuery";
import { useAnalyticsDataAccess } from "../adapters/useAnalyticsDataAccess";
import { useAnalyticsResolver } from "../adapters/useAnalyticsResolver";
import { useAiProvider } from "@/providers/data";
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
  aiActive: boolean;
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

  const [aiActive, setAiActive] = useState(false);
  const ai = useAiProvider();
  const resolver = useAnalyticsResolver(aiActive);

  useEffect(() => {
    let cancelled = false;
    ai.isAiFeatureEnabled("analytics_copilot")
      .then((v) => {
        if (!cancelled) setAiActive(v);
      })
      .catch(() => {
        if (!cancelled) setAiActive(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ai]);

  // Per-session pending flag. A slow request in session A must not show a phantom
  // typing indicator (or lock the composer) once the user switches to session B —
  // so we track which sessions have an in-flight request, not a single global bool.
  const [thinkingSessionIds, setThinkingSessionIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const messages = activeSession.messages;
  const lastResolvedAnswer = useMemo(() => lastResolved(messages), [messages]);
  const isThinking = thinkingSessionIds.has(activeSessionId);

  const ask = useCallback(
    async (question: string): Promise<void> => {
      const trimmed = question.trim();
      if (!trimmed) return;

      // Bind this request to the session it was asked in, so the pending state
      // (and the appended answer) stay with that session even if the user switches.
      const askSessionId = activeSessionId;
      appendToActive([makeMessage({ role: "user", text: trimmed })]);
      setThinkingSessionIds((prev) => {
        const next = new Set(prev);
        next.add(askSessionId);
        return next;
      });

      try {
        const effectiveRole = role ?? "Vendedor";
        const sellerId = effectiveRole === "Vendedor" ? currentUser?.sellerId : undefined;
        const { answers } = await runCopilotQuery(
          trimmed,
          {
            role: effectiveRole,
            storeId: currentStoreId ?? undefined,
            sellerId,
            period: monthBounds(new Date()),
            fallbackSuggestions: suggestionsForRole(role),
          },
          { dataAccess, catalog: metricCatalog, resolver },
        );

        for (const a of answers) {
          if (a.resolved && a.query) {
            auditLog({
              action: "analytics_copilot_query",
              resource: "insight",
              resourceId: a.query.metricId,
              storeId: currentStoreId ?? undefined,
            });
          }
        }

        appendToActive(answers.map((a) => makeMessage({ role: "assistant", answer: a })));
      } finally {
        setThinkingSessionIds((prev) => {
          if (!prev.has(askSessionId)) return prev;
          const next = new Set(prev);
          next.delete(askSessionId);
          return next;
        });
      }
    },
    [appendToActive, dataAccess, role, currentStoreId, currentUser, resolver, activeSessionId],
  );

  return {
    sessions,
    activeSessionId,
    messages,
    isThinking,
    lastResolvedAnswer,
    aiActive,
    ask,
    newSession,
    selectSession,
    deleteSession,
  };
}
