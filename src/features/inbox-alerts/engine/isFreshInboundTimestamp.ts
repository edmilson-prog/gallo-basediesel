import { isRecentEvent } from "./isRecentEvent";

/**
 * True when `candidateIso` is a recent (see `isRecentEvent`) inbound message
 * timestamp AND strictly newer than the last one already alerted for this
 * conversation. Backs the dedupe between the fast path (`messages` INSERT)
 * and the reliable fallback (`conversations` touch + `getLastInboundAt`) —
 * whichever detects a candidate first "wins" and the other sees it covered.
 */
export function isFreshInboundTimestamp(
  candidateIso: string,
  lastAlertedIso: string | null,
  nowIso: string,
  maxAgeMs: number,
): boolean {
  if (!isRecentEvent(candidateIso, nowIso, maxAgeMs)) return false;
  if (lastAlertedIso === null) return true;
  return Date.parse(candidateIso) > Date.parse(lastAlertedIso);
}
