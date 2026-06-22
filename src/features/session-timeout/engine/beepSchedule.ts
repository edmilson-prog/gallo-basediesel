/** Interval between beeps at the start of the window (urgency 0). */
export const BEEP_INTERVAL_MAX_MS = 8_000;
/** Interval between beeps at the end of the window (urgency 1). */
export const BEEP_INTERVAL_MIN_MS = 800;

export interface IBeepDecision {
  beep: boolean;
  /** 0..1 — grows as time runs out; modulates frequency/volume of beep. */
  urgency: number;
}

/**
 * Decides whether this tick should emit a beep and with what urgency.
 * `remainingMs` = milliseconds until logout; `lastBeepRemainingMs` = the `remainingMs`
 * recorded at the previous beep (null = no beep emitted yet in this window).
 * Decreasing cadence: beeps more spaced at the start, dense at the end.
 */
export function shouldBeepAtTick(
  remainingMs: number,
  warningMs: number,
  lastBeepRemainingMs: number | null,
): IBeepDecision {
  if (warningMs <= 0 || remainingMs <= 0 || remainingMs > warningMs) {
    return { beep: false, urgency: remainingMs <= 0 ? 1 : 0 };
  }
  const urgency = Math.min(1, Math.max(0, 1 - remainingMs / warningMs));
  if (lastBeepRemainingMs === null) {
    return { beep: true, urgency };
  }
  const interval =
    BEEP_INTERVAL_MAX_MS - urgency * (BEEP_INTERVAL_MAX_MS - BEEP_INTERVAL_MIN_MS);
  const elapsedSinceLastBeep = lastBeepRemainingMs - remainingMs;
  return { beep: elapsedSinceLastBeep >= interval, urgency };
}
