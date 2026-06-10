/**
 * Evolution API constants (PRD-113 RF-004).
 *
 * Evolution is self-hosted (VPS) and version-PINNED at v2.x — endpoint shapes
 * below follow v2; bumping the instance version is an explicit PR.
 */

import type { IProviderCapabilities } from "../types";

export const EVOLUTION_TARGET_VERSION = "v2.x";

/**
 * Secret-name suffixes appended to `whatsapp_accounts.credentials_ref`
 * (e.g. ref `WHATSAPP_EVO_CAMPANHAS` → `WHATSAPP_EVO_CAMPANHAS_API_KEY`).
 * `_WEBHOOK_SECRET` is optional — absent, webhook auth relies on the IP
 * allowlist enforced by PRD-114.
 */
export const EVOLUTION_SECRET_SUFFIXES = {
  apiKey: "_API_KEY",
  webhookSecret: "_WEBHOOK_SECRET",
} as const;

/**
 * Honest capability matrix (PRD-113 "capabilities honestas"):
 * - no HSM templates, no approved interactive messages;
 * - `supportsMediaUpload=false` — Evolution has NO separate upload step;
 *   media is sent by URL in `sendMedia` (deviation from the PRD's `true`,
 *   recorded in docs/dev/whatsapp-evolution-provider.md).
 */
export const EVOLUTION_CAPABILITIES: IProviderCapabilities = {
  supportsTemplates: false,
  supportsInteractive: false,
  supportsMediaUpload: false,
  supportsStatusReadReceipts: true,
  supportsCustomWebhook: true,
  maxMessageLength: 65_536,
  maxMediaSizeBytes: 64 * 1024 * 1024, // configurable on the VPS; 64 MiB default
};
