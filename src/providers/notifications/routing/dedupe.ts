import type { NotificationEventType } from "../events";

const WINDOW_MS = 60_000;

/**
 * Deterministic dedupe key collapsing the same fact emitted twice within a
 * ~60s window for the same recipient. The router uses it so a repeated event
 * does not create duplicate notifications.
 */
export function dedupeKey(
  type: NotificationEventType,
  entityId: string | undefined,
  occurredAtIso: string,
  recipientId: string,
): string {
  const bucket = Math.floor(new Date(occurredAtIso).getTime() / WINDOW_MS);
  return `${type}:${entityId ?? "-"}:${recipientId}:${bucket}`;
}
