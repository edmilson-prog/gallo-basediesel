/**
 * WhatsApp outbound delivery status ranking (PRD-118 refinement).
 *
 * `failed` deliberately sits BELOW `delivered`/`read`: Evolution/Baileys emits
 * a spurious `ERROR` ack mid-flight (re-encryption / multi-device sync) for
 * messages that are in fact delivered and read. Treating `failed` as a
 * top-rank terminal state froze those bubbles on a red "Tentar novamente" even
 * though the message arrived — a false negative. Ranking `failed` as a
 * RECOVERABLE intermediate lets a later `delivered`/`read` supersede it, while
 * a genuine failure (which never advances) still stays `failed`.
 *
 * Runtime-agnostic file: no imports, Web APIs only — mirrored verbatim into
 * supabase/functions/_shared/whatsapp/ by scripts/sync-whatsapp-shared.ts, so
 * the webhook adapter and the Inbox UI share one source of truth.
 */

/** Outbound delivery lifecycle — mirrors `MessageStatus` in @/shared/types. */
export type DeliveryStatus = "queued" | "sent" | "delivered" | "read" | "failed";

/** Monotonic delivery ranking; `failed` is recoverable (below delivered/read). */
export const MESSAGE_STATUS_RANK: Record<DeliveryStatus, number> = {
  queued: 0,
  sent: 1,
  failed: 2,
  delivered: 3,
  read: 4,
};

/**
 * True when `incoming` should overwrite `current` — i.e. it does not regress
 * the lifecycle. Equal ranks re-apply (idempotent), which is harmless because
 * the webhook dedups identical status events upstream by event key.
 */
export function statusAdvances(current: DeliveryStatus, incoming: DeliveryStatus): boolean {
  return MESSAGE_STATUS_RANK[incoming] >= MESSAGE_STATUS_RANK[current];
}
