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

/** Human label of a scheduled time in the viewer's local zone — "13/06 às 14:29". */
export function formatScheduleLabel(scheduledFor: ISO8601): string {
  const d = new Date(scheduledFor);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const WEEKDAYS_PT = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

/**
 * Natural-language confirmation of a scheduled time in the viewer's local zone:
 * "Será enviado sábado, 13/06 às 14:29 (horário de Brasília)." Returns an empty
 * string for null/invalid input so drafts (no time) render nothing.
 */
export function formatScheduleConfirm(scheduledFor: ISO8601 | null): string {
  if (!scheduledFor) return "";
  const at = Date.parse(scheduledFor);
  if (Number.isNaN(at)) return "";
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const weekday = WEEKDAYS_PT[d.getDay()];
  const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `Será enviado ${weekday}, ${date} às ${time} (horário de Brasília).`;
}
