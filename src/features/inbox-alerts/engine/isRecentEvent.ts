/**
 * True when `eventIso` is within `maxAgeMs` of `nowIso` in EITHER direction.
 * Guards beeps against stale events replayed by an import/backfill job (which
 * still fire a normal INSERT on the table, but with an old timestamp) AND
 * against implausible far-future timestamps (a malformed webhook payload or a
 * device with a badly-set clock). A modest future skew — up to `maxAgeMs` ahead
 * — is still treated as recent; anything further ahead is rejected outright,
 * so a bogus far-future `sent_at`/`last_message_at` can never stay "fresh" for
 * hours until real time catches up to it.
 */
export function isRecentEvent(eventIso: string, nowIso: string, maxAgeMs: number): boolean {
  const eventMs = Date.parse(eventIso);
  const nowMs = Date.parse(nowIso);
  if (Number.isNaN(eventMs) || Number.isNaN(nowMs)) return false;
  const delta = nowMs - eventMs;
  return delta >= -maxAgeMs && delta <= maxAgeMs;
}
