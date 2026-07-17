import type { IWorkSchedule } from "@/shared/types";

/**
 * Business-time elapsed between two instants, following the seller's weekly
 * attendance schedule (PRD-212). São Paulo is a fixed UTC-03:00 offset (no DST
 * since 2019) — same convention as src/features/access/engine/workSchedule.ts.
 *
 * MUST stay in exact parity with the SQL mirror `public.idle_business_seconds`
 * (supabase/migrations/20260716190000_idle_conversation_alerts.sql):
 * - absent/empty schedule ⇒ raw elapsed seconds;
 * - only `enabled` windows count; scheduleOverrides are OUT of scope (v1);
 * - the window is clamped to the last 90 days.
 */
const SAO_PAULO_OFFSET_MINUTES = 180;
const CLAMP_DAYS = 90;

function timeToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return Number.NaN;
  return hours * 60 + minutes;
}

export function businessSecondsBetween(
  schedule: IWorkSchedule | undefined,
  from: Date,
  to: Date,
): number {
  if (!(to.getTime() > from.getTime())) return 0;
  const clampedFromMs = Math.max(from.getTime(), to.getTime() - CLAMP_DAYS * 86400_000);

  const windows = (schedule ?? []).filter((w) => w.enabled);
  if (windows.length === 0) return Math.floor((to.getTime() - clampedFromMs) / 1000);

  // Shift to São Paulo wall clock expressed as UTC, then walk day by day.
  const offsetMs = SAO_PAULO_OFFSET_MINUTES * 60_000;
  const fromSp = clampedFromMs - offsetMs;
  const toSp = to.getTime() - offsetMs;

  let total = 0;
  // Midnight (UTC) of the shifted `from` day.
  let dayStart = new Date(fromSp);
  dayStart = new Date(
    Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), dayStart.getUTCDate()),
  );
  for (let cursor = dayStart.getTime(); cursor < toSp; cursor += 86400_000) {
    const weekday = new Date(cursor).getUTCDay();
    for (const win of windows) {
      if (win.weekday !== weekday) continue;
      const open = timeToMinutes(win.openAt);
      const close = timeToMinutes(win.closeAt);
      if (Number.isNaN(open) || Number.isNaN(close) || close <= open) continue;
      const winStart = cursor + open * 60_000;
      const winEnd = cursor + close * 60_000;
      const overlap = Math.min(winEnd, toSp) - Math.max(winStart, fromSp);
      if (overlap > 0) total += overlap;
    }
  }
  return Math.floor(total / 1000);
}
