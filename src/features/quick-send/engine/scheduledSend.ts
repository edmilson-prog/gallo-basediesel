import type { ISO8601 } from "@/shared/types";

/**
 * Scheduled-send timing helpers (PRD-027 RF-023, D-11). `isDue` decides when a
 * pending send fires (scheduledFor <= now); `validateFuture` rejects past or
 * present datetimes at creation. Pure; compares ISO 8601 via Date.parse so it
 * is timezone-safe.
 */

export function isDue(scheduledFor: ISO8601, now: ISO8601): boolean {
  return Date.parse(scheduledFor) <= Date.parse(now);
}

export function validateFuture(
  scheduledFor: ISO8601,
  now: ISO8601,
): { ok: boolean; reason?: string } {
  const at = Date.parse(scheduledFor);
  if (Number.isNaN(at)) {
    return { ok: false, reason: "Data inválida." };
  }
  if (at <= Date.parse(now)) {
    return { ok: false, reason: "O horário do agendamento deve estar no futuro." };
  }
  return { ok: true };
}
