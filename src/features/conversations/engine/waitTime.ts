/**
 * Pure helpers for the Inbox "wait time" counter. They receive an already
 * computed elapsed duration in milliseconds (the caller subtracts `queuedAt`
 * from the shared `useTimeTick` clock) so they stay clock-free and testable.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Wait duration at/after which the counter turns amber (attention). */
export const WAIT_WARNING_MS = 10 * MINUTE;
/** Wait duration at/after which the counter turns red (urgent). */
export const WAIT_CRITICAL_MS = 30 * MINUTE;

export type WaitSeverity = "neutral" | "warning" | "critical";

/** Traffic-light severity for a wait duration. Thresholds are inclusive. */
export function waitSeverity(ms: number): WaitSeverity {
  if (ms >= WAIT_CRITICAL_MS) return "critical";
  if (ms >= WAIT_WARNING_MS) return "warning";
  return "neutral";
}

/**
 * Compact wait label: `<1 min` under a minute, `N min` under an hour,
 * `Hh MM` (zero-padded minutes) under a day, `N d` beyond a day.
 */
export function formatWaitTime(ms: number): string {
  if (ms < MINUTE) return "<1 min";
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min`;
  if (ms < DAY) {
    const h = Math.floor(ms / HOUR);
    const m = Math.floor((ms % HOUR) / MINUTE);
    return `${h}h ${String(m).padStart(2, "0")}`;
  }
  return `${Math.floor(ms / DAY)} d`;
}
