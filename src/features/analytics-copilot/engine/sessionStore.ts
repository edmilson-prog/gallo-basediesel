// src/features/analytics-copilot/engine/sessionStore.ts
import type { IAnalyticsMessage } from "@/shared/types/analytics-copilot";

export interface ICopilotSessionRecord {
  id: string;
  title: string;
  messages: IAnalyticsMessage[];
  createdAt: string;
  updatedAt: string;
}

const TITLE_MAX = 40;
const DEFAULT_TITLE = "Nova conversa";

/** Title derived from the first user message, truncated. Falls back to a default. */
export function deriveTitle(messages: IAnalyticsMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user" && m.text && m.text.trim().length > 0);
  const raw = firstUser?.text?.trim();
  if (!raw) return DEFAULT_TITLE;
  return raw.length > TITLE_MAX ? `${raw.slice(0, TITLE_MAX)}…` : raw;
}

export function createSession(now: string, id: string): ICopilotSessionRecord {
  return { id, title: DEFAULT_TITLE, messages: [], createdAt: now, updatedAt: now };
}

export function appendMessages(
  session: ICopilotSessionRecord,
  messages: IAnalyticsMessage[],
  now: string,
): ICopilotSessionRecord {
  const nextMessages = [...session.messages, ...messages];
  return {
    ...session,
    messages: nextMessages,
    title: session.title === DEFAULT_TITLE ? deriveTitle(nextMessages) : session.title,
    updatedAt: now,
  };
}

/** Insert-or-replace by id; the affected session moves to the front (most recent). */
export function upsertSession(
  list: ICopilotSessionRecord[],
  session: ICopilotSessionRecord,
): ICopilotSessionRecord[] {
  const without = list.filter((s) => s.id !== session.id);
  return [session, ...without];
}

export function deleteSession(
  list: ICopilotSessionRecord[],
  id: string,
): ICopilotSessionRecord[] {
  return list.filter((s) => s.id !== id);
}

/** Keep only the `max` most recently updated sessions. */
export function enforceRetention(
  list: ICopilotSessionRecord[],
  max = 50,
): ICopilotSessionRecord[] {
  if (list.length <= max) return list;
  return [...list]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, max);
}

function isSessionRecord(value: unknown): value is ICopilotSessionRecord {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    Array.isArray(v.messages) &&
    typeof v.createdAt === "string" &&
    typeof v.updatedAt === "string"
  );
}

/** Defensive parse of the persisted list — returns [] on any malformed input. */
export function parseSessionList(raw: string | null): ICopilotSessionRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSessionRecord);
  } catch {
    return [];
  }
}
