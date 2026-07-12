// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/waha/constants.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * WAHA (devlikeapro/waha) constants. Self-hosted server (GOWS/whatsmeow
 * engine). Fully isolated from the Meta/Evolution/Evolution Go engines —
 * this module never imports from ../build.ts, ../factory.ts, or
 * ../IWhatsAppProvider.ts. It reuses only pure, read-only utilities
 * (WhatsAppProviderError, timingSafeEqualStrings) and normalized types.
 */

export const WAHA_INTEGRATION_NAME = "whatsapp_waha" as const;

/**
 * Webhook events subscribed on session create — message.ack deferred to
 * phase 2. WAHA (GOWS engine) emits `fromMe: true` messages (sent straight
 * from the paired phone, outside the platform) ONLY on `message.any` — never
 * on plain `message`, which is inbound-only. Both are needed: `message` for
 * customer messages, `message.any` for outbound-echo mirroring.
 */
export const WAHA_DEFAULT_EVENTS = ["message", "message.any", "session.status"] as const;

export const WAHA_SESSION_STATES = [
  "STOPPED",
  "STARTING",
  "SCAN_QR_CODE",
  "WORKING",
  "FAILED",
] as const;

export type WahaSessionState = (typeof WAHA_SESSION_STATES)[number];

/** Maps a raw WAHA session state to the platform's IWhatsAppAccount status. */
export function wahaStateToAccountStatus(state: string): "connected" | "disconnected" | "pending" {
  if (state === "WORKING") return "connected";
  if (state === "STOPPED" || state === "FAILED") return "disconnected";
  return "pending"; // STARTING | SCAN_QR_CODE | unknown
}
