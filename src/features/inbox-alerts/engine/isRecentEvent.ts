/**
 * True when `eventIso` happened at most `maxAgeMs` before `nowIso`. Guards
 * beeps against stale events replayed by an import/backfill job (which still
 * fire a normal INSERT on the table, but with an old timestamp). A future
 * `eventIso` (clock skew) is treated as recent, never rejected.
 */
export function isRecentEvent(eventIso: string, nowIso: string, maxAgeMs: number): boolean {
  const eventMs = Date.parse(eventIso);
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(eventMs) || Number.isNaN(nowMs)) return false;
  return nowMs - eventMs <= maxAgeMs;
}
