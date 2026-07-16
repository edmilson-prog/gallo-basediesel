/**
 * WAHA `message.ack` event — delivery/read status for outbound messages.
 * Payload shape (WAHA docs, "Events" — confirmed live 2026-07-15, GOWS
 * engine): { id, from, participant, fromMe, ack, ackName }. Ack scale
 * (WAHA docs, "Events"): -1 ERROR, 0 PENDING, 1 SERVER, 2 DEVICE, 3 READ,
 * 4 PLAYED (voice notes). No timestamp field — callers stamp
 * delivered_at/read_at with the server-received time instead.
 */

import type { DeliveryStatus } from "../messageStatus";

/** Maps a WAHA ack level to the platform's delivery lifecycle. Anything
 *  ≥ 3 (READ, PLAYED, or a future higher level) is treated as `read`. */
export function mapWahaAckToStatus(ack: number): DeliveryStatus {
  if (ack <= -1) return "failed";
  if (ack === 0) return "queued";
  if (ack === 1) return "sent";
  if (ack === 2) return "delivered";
  return "read";
}

interface IWahaAckPayload {
  id?: string;
  ack?: number;
  ackName?: string;
}

/** Parses a `message.ack` envelope's `payload`. Returns null when the id is
 *  missing or ack isn't a finite number — callers treat that as "ignore,
 *  nothing to update" rather than throwing. */
export function parseWahaAckPayload(
  rawPayload: unknown,
): { providerMessageId: string; status: DeliveryStatus } | null {
  const payload = rawPayload as IWahaAckPayload | null;
  if (!payload?.id || typeof payload.ack !== "number" || !Number.isFinite(payload.ack)) {
    return null;
  }
  return { providerMessageId: payload.id, status: mapWahaAckToStatus(payload.ack) };
}
