// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/openwa/constants.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * OpenWA constants (self-hosted whatsapp-web.js REST server — REDUNDANT
 * primary engine for new stores/numbers, same VPS as evolution/evolution-go).
 *
 * Endpoint shapes below are CONFIRMED live against the real server
 * (openwa.ailainteligente.com.br, server version 0.8.9) on 2026-07-07:
 * base path `/api`, `x-api-key` header, `/sessions` resource with
 * server-generated ids, `/sessions/{id}/messages/send-text|send-image|
 * send-video|send-audio|send-document` with `{chatId, ...}` bodies, and
 * `/sessions/{id}/webhooks` for event subscriptions. See
 * docs/dev/whatsapp-openwa-provider.md for the full confirmed contract and
 * what remains inferred (webhook envelope shape, ack event body).
 */

import type { IProviderCapabilities } from "../types.ts";

export const OPENWA_TARGET_VERSION = "rmyndharis/OpenWA (whatsapp-web.js)";

/**
 * ONE global API key authenticates an entire OpenWA SERVER for every session
 * on it (confirmed live) — architecturally like Evolution Go, unlike classic
 * Evolution's per-instance apikey. The key lives on the `whatsapp_openwa_servers`
 * registry (`api_key_ref` → Vault secret name), NOT on `whatsapp_accounts`.
 * OpenWA's webhook has no documented HMAC secret feature — auth relies on the
 * same PRD-114 IP allowlist as Evolution; no `_WEBHOOK_SECRET` concept here.
 */
export const OPENWA_SERVER_KEY_SUFFIX = "_API_KEY";

/** Webhook event names accepted by `POST /sessions/{id}/webhooks` (confirmed live). */
export const OPENWA_WEBHOOK_EVENTS = [
  "message.received",
  "message.ack",
  "message.sent",
  "session.status",
  "session.qr",
] as const;

/**
 * Honest capability matrix. Media send is confirmed to support image, video,
 * audio and document — but always by URL (no separate upload step), same
 * constraint as Evolution. No HSM templates, no approved interactive messages
 * (whatsapp-web.js is a personal-session client, not the Business Platform).
 */
export const OPENWA_CAPABILITIES: IProviderCapabilities = {
  supportsTemplates: false,
  supportsInteractive: false,
  supportsMediaUpload: false,
  supportsStatusReadReceipts: true,
  supportsCustomWebhook: true,
  maxMessageLength: 65_536,
  maxMediaSizeBytes: 64 * 1024 * 1024,
};
