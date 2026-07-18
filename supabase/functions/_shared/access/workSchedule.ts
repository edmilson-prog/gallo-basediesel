// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/features/access/engine/workSchedule.ts (sync: bun run scripts/sync-conversation-rescue-shared.ts)

import type { IWorkSchedule, IWorkScheduleWindow, IScheduleOverride } from "@/shared/types";

/**
 * América/São Paulo timezone helpers (PRD-212).
 *
 * Brazil has had **no daylight saving time since 2019**, so São Paulo is a
 * fixed UTC-03:00 offset. We rely on that fixed offset (180 min) instead of
 * pulling in `date-fns-tz`, which keeps the math trivial, dependency-free and
 * fully deterministic. If Brazil ever reinstates DST this module must change.
 */
const SAO_PAULO_OFFSET_MINUTES = 180;

export interface IScheduleSource {
  workSchedule?: IWorkSchedule;
  scheduleOverrides?: IScheduleOverride[];
}

/** Parse "HH:mm" into minutes since midnight. Returns NaN on bad input. */
function timeToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return Number.NaN;
  return hours * 60 + minutes;
}

/** São Paulo wall-clock parts of `date`, independent of the device timezone. */
export function saoPauloParts(date: Date): { weekday: number; minutes: number; ymd: string } {
  const shifted = new Date(date.getTime() - SAO_PAULO_OFFSET_MINUTES * 60_000);
  return {
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    ymd: shifted.toISOString().slice(0, 10),
  };
}

/** Builds a UTC ISO instant from São Paulo wall-clock components. */
function saoPauloInstant(ymd: string, minutesOfDay: number): string {
  const parts = ymd.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;
  const ms = Date.UTC(y, m - 1, d, hour, minute) + SAO_PAULO_OFFSET_MINUTES * 60_000;
  return new Date(ms).toISOString();
}

/** Enabled windows for a given weekday. */
function windowsForWeekday(schedule: IWorkSchedule, weekday: number): IWorkScheduleWindow[] {
  return schedule.filter((w) => w.enabled && w.weekday === weekday);
}

/**
 * True when `date` falls inside the user's attendance schedule in São Paulo
 * time. Absent/empty schedule = no restriction (always true). A `block`
 * override closes the day; an `allow` override opens it (whole day, or a
 * partial window if openAt/closeAt are set). Windows spanning midnight are NOT
 * supported (matches the existing business-hours editor).
 */
export function isWithinWorkSchedule(source: IScheduleSource, date: Date): boolean {
  const schedule = source.workSchedule ?? [];
  const overrides = source.scheduleOverrides ?? [];
  const { weekday, minutes, ymd } = saoPauloParts(date);

  // No schedule at all and no allow override = unrestricted.
  if (schedule.length === 0 && overrides.length === 0) return true;

  const override = overrides.find((o) => o.date === ymd);
  if (override) {
    if (override.type === "block") return false;
    // allow: full day unless a partial window is given.
    const open = override.openAt ? timeToMinutes(override.openAt) : 0;
    const close = override.closeAt ? timeToMinutes(override.closeAt) : 24 * 60;
    if (Number.isNaN(open) || Number.isNaN(close)) return true;
    return minutes >= open && minutes < close;
  }

  // No weekly schedule and no matching override → unrestricted.
  if (schedule.length === 0) return true;

  for (const win of windowsForWeekday(schedule, weekday)) {
    const open = timeToMinutes(win.openAt);
    const close = timeToMinutes(win.closeAt);
    if (Number.isNaN(open) || Number.isNaN(close)) continue;
    if (minutes >= open && minutes < close) return true;
  }
  return false;
}

/**
 * Next window-start instant (ISO8601) strictly after `date`, scanning up to 7
 * days ahead and honouring overrides. Returns null when there is no schedule
 * (i.e. access is unrestricted, so there is nothing to "wait for").
 */
export function getNextOpenAt(source: IScheduleSource, date: Date): string | null {
  const schedule = source.workSchedule ?? [];
  const overrides = source.scheduleOverrides ?? [];
  if (schedule.length === 0 && overrides.length === 0) return null;

  const start = saoPauloParts(date);
  const parts = start.ymd.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  for (let offset = 0; offset <= 7; offset += 1) {
    // Compute the São Paulo calendar day at `offset` days from `start.ymd`.
    const dayUtc = new Date(Date.UTC(y, m - 1, d + offset));
    const ymd = dayUtc.toISOString().slice(0, 10);
    const weekday = dayUtc.getUTCDay();
    const minFloor = offset === 0 ? start.minutes : -1;

    const override = overrides.find((o) => o.date === ymd);
    let candidates: number[] = [];
    if (override) {
      if (override.type === "block") continue;
      candidates = [override.openAt ? timeToMinutes(override.openAt) : 0];
    } else {
      candidates = windowsForWeekday(schedule, weekday)
        .map((w) => timeToMinutes(w.openAt))
        .filter((n) => !Number.isNaN(n));
    }
    const next = candidates.filter((open) => open > minFloor).sort((a, b) => a - b)[0];
    if (next !== undefined) return saoPauloInstant(ymd, next);
  }
  return null;
}

/** Returns validation errors (pt-BR) for a weekly schedule; [] when valid. */
export function validateWorkSchedule(schedule: IWorkSchedule): string[] {
  const errors: string[] = [];
  for (const win of schedule) {
    if (!win.enabled) continue;
    const open = timeToMinutes(win.openAt);
    const close = timeToMinutes(win.closeAt);
    if (Number.isNaN(open) || Number.isNaN(close)) {
      errors.push("Horário inválido em uma das janelas.");
      continue;
    }
    if (close <= open) {
      errors.push("O horário de término deve ser maior que o de início.");
    }
  }
  // Overlap detection per weekday.
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const wins = windowsForWeekday(schedule, weekday)
      .map((w) => ({ open: timeToMinutes(w.openAt), close: timeToMinutes(w.closeAt) }))
      .filter((w) => !Number.isNaN(w.open) && !Number.isNaN(w.close) && w.close > w.open)
      .sort((a, b) => a.open - b.open);
    for (let i = 1; i < wins.length; i += 1) {
      const cur = wins[i];
      const prev = wins[i - 1];
      if (cur && prev && cur.open < prev.close) {
        errors.push("Há janelas sobrepostas no mesmo dia.");
        break;
      }
    }
  }
  return errors;
}
