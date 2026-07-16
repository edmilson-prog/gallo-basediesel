// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/features/distribution/engine/businessHours.ts (sync: bun run scripts/sync-business-hours-shared.ts)

import type { IBusinessHoursWindow } from "@/shared/types";

/** Parse `"HH:mm"` into minutes since midnight. Returns NaN on bad input. */
function timeToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return Number.NaN;
  return hours * 60 + minutes;
}

/**
 * Returns true when `date` falls inside any enabled business-hours window.
 *
 * Windows that span midnight (e.g. opening at 22:00 and closing at 02:00) are
 * **not** supported — keeps the comparison straightforward and matches the UI
 * editor in the admin panel.
 */
export function isWithinBusinessHours(date: Date, windows: IBusinessHoursWindow[]): boolean {
  const weekday = date.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const minutesOfDay = date.getHours() * 60 + date.getMinutes();
  for (const win of windows) {
    if (!win.enabled) continue;
    if (win.weekday !== weekday) continue;
    const open = timeToMinutes(win.openAt);
    const close = timeToMinutes(win.closeAt);
    if (Number.isNaN(open) || Number.isNaN(close)) continue;
    if (minutesOfDay >= open && minutesOfDay < close) return true;
  }
  return false;
}
