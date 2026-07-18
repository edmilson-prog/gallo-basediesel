// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/features/conversation-rescue/engine/rescueCooldown.ts (sync: bun run scripts/sync-conversation-rescue-shared.ts)

/**
 * Re-broadcast cooldown (incident 2026-07-18). Claiming a rescue does not
 * clear `awaiting_reply_since` (only a real outbound reply does — sub-project
 * A trigger), so without a cooldown the same conversation re-qualified on the
 * very next tick whenever the claimer wasn't `online`, looping forever. Any
 * rescue resolved within the cooldown window suppresses a new broadcast for
 * that conversation.
 */

export const RESCUE_REBROADCAST_COOLDOWN_MINUTES = 60;

export interface IRescueCooldownEntry {
  /** ISO8601 or null — set when the rescue was claimed. */
  claimedAt?: string | null;
  /** ISO8601 or null — set when the rescue was force-assigned. */
  forcedAt?: string | null;
  /** ISO8601 — row creation. Floor for `cancelled` rows, which carry no
   * resolution timestamp of their own. */
  createdAt: string;
}

/** True when any resolved rescue for the conversation is newer than the cooldown. */
export function isWithinRescueCooldown(
  entries: IRescueCooldownEntry[],
  now: Date,
  cooldownMinutes: number,
): boolean {
  const cutoff = now.getTime() - cooldownMinutes * 60_000;
  return entries.some((entry) => {
    const resolvedAt = Math.max(
      entry.claimedAt ? new Date(entry.claimedAt).getTime() : 0,
      entry.forcedAt ? new Date(entry.forcedAt).getTime() : 0,
      new Date(entry.createdAt).getTime(),
    );
    return resolvedAt > cutoff;
  });
}
