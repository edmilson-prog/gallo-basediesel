/**
 * Evolution Go constants. Self-hosted whatsmeow server (https://evogo...).
 * Honest capabilities mirror Evolution v2: no HSM templates, no interactive
 * messages, media sent by URL (no separate upload step).
 */

import type { IProviderCapabilities } from "../types";

export const EVOLUTION_GO_TARGET = "evolution-go (whatsmeow)";

export const EVOLUTION_GO_INTEGRATION_NAME = "whatsapp_evolution_go" as const;

/**
 * Secret-name suffixes appended to `whatsapp_accounts.credentials_ref`.
 * `_API_KEY` = the server-wide global apikey — used ONLY for admin endpoints
 * (/instance/create, /instance/all) by the edge, NOT by the messaging provider.
 * `_INSTANCE_TOKEN` = the per-instance token — used as the `apikey` for every
 * instance-scoped call (send/status/download/connect/…) AND as the webhook auth
 * (smoke-confirmed 2026-06-25: the Go server authorizes instances by this token).
 */
export const EVOLUTION_GO_SECRET_SUFFIXES = {
  apiKey: "_API_KEY",
  instanceToken: "_INSTANCE_TOKEN",
} as const;

/** Webhook event categories we subscribe by default (Go uses category names). */
export const EVOLUTION_GO_DEFAULT_SUBSCRIBE: string[] = [
  "MESSAGE",
  "SEND_MESSAGE",
  "READ_RECEIPT",
  "CONNECTION",
  // Phase 2: whatsmeow pushes the linked device's chat/message history as
  // HistorySync notifications right after pairing. Subscribing here makes the
  // Go server forward them to our webhook (captured raw in Etapa A).
  "HISTORY_SYNC",
];

export const EVOLUTION_GO_CAPABILITIES: IProviderCapabilities = {
  supportsTemplates: false,
  supportsInteractive: false,
  supportsMediaUpload: false,
  supportsStatusReadReceipts: true,
  supportsCustomWebhook: true,
  maxMessageLength: 65_536,
  maxMediaSizeBytes: 64 * 1024 * 1024,
};
