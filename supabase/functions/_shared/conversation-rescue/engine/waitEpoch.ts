// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/features/conversation-rescue/engine/waitEpoch.ts (sync: bun run scripts/sync-conversation-rescue-shared.ts)

/**
 * Wait-epoch comparison (incident review 2026-07-18, round 3).
 *
 * `conversations.awaiting_reply_since` is a CLOCK, not a flag: the sub-project-A
 * trigger clears it when the seller replies and re-stamps it when the client
 * writes again. A rescue row is created for ONE such wait; testing only
 * `awaiting_reply_since !== null` cannot tell "the original client is still
 * waiting" from "the absent seller already replied and a brand-new question
 * arrived", because both read as non-null.
 *
 * That difference is load-bearing on the force path, which is irreversible: a
 * stale row revalidated against a fresh wait rips the conversation away from
 * the seller who just answered.
 */

/**
 * True when `awaitingReplySince` belongs to the same wait the rescue was
 * broadcast for — i.e. the wait already existed when the row was created.
 * A wait that started AFTER the broadcast is a new epoch and must retire the
 * row instead of justifying it.
 *
 * Fail-closed: unparseable input returns false. The callers react by
 * cancelling, never by forcing, so an unreadable clock costs a rescue rather
 * than a wrong reassignment.
 */
export function isSameWaitEpoch(
  awaitingReplySince: string | null,
  broadcastAt: string,
): boolean {
  if (!awaitingReplySince) return false;
  const waitStartedAt = new Date(awaitingReplySince).getTime();
  const broadcastedAt = new Date(broadcastAt).getTime();
  if (Number.isNaN(waitStartedAt) || Number.isNaN(broadcastedAt)) return false;
  return waitStartedAt <= broadcastedAt;
}
