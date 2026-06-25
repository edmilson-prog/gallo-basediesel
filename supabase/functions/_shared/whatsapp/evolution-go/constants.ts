// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/evolution-go/constants.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * Evolution Go constants. Self-hosted whatsmeow server (https://evogo...).
 * Honest capabilities mirror Evolution v2: no HSM templates, no interactive
 * messages, media sent by URL (no separate upload step).
 */

import type { IProviderCapabilities } from "../types.ts";

export const EVOLUTION_GO_TARGET = "evolution-go (whatsmeow)";

export const EVOLUTION_GO_INTEGRATION_NAME = "whatsapp_evolution_go" as const;

/**
 * Secret-name suffixes appended to `whatsapp_accounts.credentials_ref`.
 * `_API_KEY` = the server-wide global apikey (shared by instances on the same
 * server); `_INSTANCE_TOKEN` = the per-instance token (also the webhook auth).
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
