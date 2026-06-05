// src/features/analytics-copilot/hooks/useCopilotSessions.ts
import { useCallback, useEffect, useState } from "react";
import type { IAnalyticsMessage } from "@/shared/types/analytics-copilot";
import {
  appendMessages,
  createSession,
  deleteSession as deleteFromList,
  enforceRetention,
  parseSessionList,
  upsertSession,
  type ICopilotSessionRecord,
} from "../engine/sessionStore";

const SESSIONS_KEY = "gallo-copilot-sessions";
const ACTIVE_KEY = "gallo-copilot-active";

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

function readSessions(): ICopilotSessionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return parseSessionList(window.localStorage.getItem(SESSIONS_KEY));
  } catch {
    return [];
  }
}

function readActiveId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export interface IUseCopilotSessions {
  sessions: ICopilotSessionRecord[];
  activeSession: ICopilotSessionRecord;
  activeSessionId: string;
  newSession: () => void;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  appendToActive: (messages: IAnalyticsMessage[]) => void;
}

/**
 * localStorage-backed session list for the copilot. Always exposes a valid active
 * session: state is seeded with one session on first mount, and a reconciliation
 * effect reseeds whenever the list goes empty and repairs a dangling active id.
 * Pure list logic lives in `engine/sessionStore` (tested); this hook only does
 * I/O + React state.
 */
export function useCopilotSessions(): IUseCopilotSessions {
  // Seed on first mount when storage is empty so state is never empty for more
  // than the reconciliation effect's single tick.
  const [sessions, setSessions] = useState<ICopilotSessionRecord[]>(() => {
    const stored = readSessions();
    return stored.length > 0 ? stored : [createSession(nowIso(), newId())];
  });
  const [activeId, setActiveId] = useState<string>(() => readActiveId() ?? "");

  // Keep state valid: reseed when empty, repair a dangling active id. Commits to
  // real state — no derived-but-uncommitted divergence.
  useEffect(() => {
    if (sessions.length === 0) {
      const fresh = createSession(nowIso(), newId());
      setSessions([fresh]);
      setActiveId(fresh.id);
      return;
    }
    if (!sessions.some((s) => s.id === activeId)) {
      setActiveId(sessions[0]!.id);
    }
  }, [sessions, activeId]);

  // Persist.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    } catch {
      // ignore quota errors
    }
  }, [sessions]);

  useEffect(() => {
    if (typeof window === "undefined" || !activeId) return;
    try {
      window.localStorage.setItem(ACTIVE_KEY, activeId);
    } catch {
      // ignore
    }
  }, [activeId]);

  // Always resolve a valid active session for render — guards the single tick
  // before the reconciliation effect repairs a dangling/empty active id.
  const activeSession = sessions.find((s) => s.id === activeId) ?? sessions[0]!;

  const newSession = useCallback(() => {
    const fresh = createSession(nowIso(), newId());
    setSessions((prev) => enforceRetention(upsertSession(prev, fresh)));
    setActiveId(fresh.id);
  }, []);

  const selectSession = useCallback((id: string) => setActiveId(id), []);

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => deleteFromList(prev, id));
    // Clear the active id when the active session is deleted; the reconciliation
    // effect then picks the next valid id (or a freshly seeded session).
    setActiveId((prev) => (prev === id ? "" : prev));
  }, []);

  const appendToActive = useCallback(
    (messages: IAnalyticsMessage[]) => {
      setSessions((prev) => {
        // Fall back to the first session during the transient tick where the
        // active id was just cleared by a delete.
        const current = prev.find((s) => s.id === activeId) ?? prev[0];
        if (!current) return prev;
        const updated = appendMessages(current, messages, nowIso());
        return enforceRetention(upsertSession(prev, updated));
      });
    },
    [activeId],
  );

  return {
    sessions,
    activeSession,
    activeSessionId: activeSession.id,
    newSession,
    selectSession,
    deleteSession,
    appendToActive,
  };
}
