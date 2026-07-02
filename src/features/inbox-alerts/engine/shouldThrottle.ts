/**
 * True when a beep of this kind fired less than `minIntervalMs` ago — caller
 * should skip playing it again. `lastBeepAtMs = null` (no beep yet this
 * session) is never throttled.
 */
export function shouldThrottle(
  lastBeepAtMs: number | null,
  nowMs: number,
  minIntervalMs: number,
): boolean {
  if (lastBeepAtMs === null) return false;
  return nowMs - lastBeepAtMs < minIntervalMs;
}
