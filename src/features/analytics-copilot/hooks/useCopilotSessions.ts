// src/features/analytics-copilot/hooks/useCopilotSessions.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
 * session (creating an empty one when none exists). Pure list logic lives in
 * `engine/sessionStore` (tested); this hook only does I/O + React state.
 */
export function useCopilotSessions(): IUseCopilotSessions {
  const [sessions, setSessions] = useState<ICopilotSessionRecord[]>(() => readSessions());
  const [activeId, setActiveId] = useState<string | null>(() => readActiveId());

  // Ensure there is always exactly one active session.
  const ensured = useMemo(() => {
    if (sessions.length === 0) {
      const fresh = createSession(nowIso(), newId());
      return { sessions: [fresh], activeId: fresh.id };
    }
    const validActive = activeId && sessions.some((s) => s.id === activeId);
    return { sessions, activeId: validActive ? activeId! : sessions[0]!.id };
  }, [sessions, activeId]);

  // Commit the ensured state back when it diverges (e.g. first mount with empty storage).
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    if (ensured.sessions !== sessions) setSessions(ensured.sessions);
    if (ensured.activeId !== activeId) setActiveId(ensured.activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(ensured.sessions));
    } catch {
      // ignore quota errors
    }
  }, [ensured.sessions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(ACTIVE_KEY, ensured.activeId);
    } catch {
      // ignore
    }
  }, [ensured.activeId]);

  const activeSession =
    ensured.sessions.find((s) => s.id === ensured.activeId) ?? ensured.sessions[0]!;

  const newSession = useCallback(() => {
    const fresh = createSession(nowIso(), newId());
    setSessions((prev) => enforceRetention(upsertSession(prev, fresh)));
    setActiveId(fresh.id);
  }, []);

  const selectSession = useCallback((id: string) => setActiveId(id), []);

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = deleteFromList(prev, id);
        return next;
      });
      setActiveId((prevActive) => {
        if (prevActive !== id) return prevActive;
        const remaining = ensured.sessions.filter((s) => s.id !== id);
        return remaining[0]?.id ?? null;
      });
    },
    [ensured.sessions],
  );

  const appendToActive = useCallback(
    (messages: IAnalyticsMessage[]) => {
      setSessions((prev) => {
        const current = prev.find((s) => s.id === ensured.activeId);
        if (!current) return prev;
        const updated = appendMessages(current, messages, nowIso());
        return enforceRetention(upsertSession(prev, updated));
      });
    },
    [ensured.activeId],
  );

  return {
    sessions: ensured.sessions,
    activeSession,
    activeSessionId: ensured.activeId,
    newSession,
    selectSession,
    deleteSession,
    appendToActive,
  };
}
