/**
 * Normalized types of the WhatsApp provider layer (PRD-111).
 *
 * Every concrete provider (Meta Cloud API — PRD-112; Evolution API — PRD-113)
 * speaks THESE types at its boundary; provider-specific payloads only ever
 * appear inside `rawPayload` (kept for audit). Consumers (webhook PRD-114,
 * send pipeline PRD-115, templates PRD-116, status tracking PRD-118) never
 * see a provider-specific shape.
 *
 * Naming note: the PRD spells these without the `I` prefix; the repo-wide
 * convention (CLAUDE.md) prefixes domain interfaces with `I`, so that wins.
 */

import type { ISO8601 } from "@/shared/types";

/** Provider engines supported today. Extending = widening this union (PRD-111 RF-003). */
export type WhatsAppProviderEngine = "meta" | "evolution" | "mock";

/** Content kinds a normalized inbound message can carry. */
export type InboundContentType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "location"
  | "contact";

/** Media kinds accepted for outbound sends. */
export type OutboundMediaType = "image" | "audio" | "video" | "document";

// ===== Send inputs ==========================================================

export interface ISendTextInput {
  /** `whatsapp_accounts.id` the message goes out through. */
  accountId: string;
  /** Destination phone in E.164 (e.g. +5555912345678). */
  to: string;
  text: string;
  /** Provider message id being replied to, when threading an inbound. */
  replyToMessageId?: string;
  /** Correlation id propagated end-to-end (PRD-110). */
  traceId?: string;
}

export interface ISendMediaInput {
  accountId: string;
  to: string;
  mediaType: OutboundMediaType;
  /**
   * Either a provider media id (from `uploadOutboundMedia`) or a public URL
   * the provider can fetch — concrete providers accept both.
   */
  mediaIdOrUrl: string;
  caption?: string;
  /** Original filename, required by some providers for `document` sends. */
  filename?: string;
  replyToMessageId?: string;
  traceId?: string;
}

export interface ISendTemplateInput {
  accountId: string;
  to: string;
  /** Approved HSM template name (PRD-116). */
  templateName: string;
  /** BCP-47 language tag of the approved template (e.g. pt_BR). */
  languageCode: string;
  /** Positional body parameters, in template order. */
  bodyParameters?: string[];
  traceId?: string;
}

/** One tappable choice of an interactive message. */
export interface IInteractiveOption {
  id: string;
  title: string;
  description?: string;
}

export interface ISendInteractiveInput {
  accountId: string;
  to: string;
  bodyText: string;
  /** `buttons` caps at 3 options; `list` allows up to 10 (provider enforces). */
  kind: "buttons" | "list";
  options: IInteractiveOption[];
  /** Button label that opens the list (list kind only). */
  listButtonLabel?: string;
  traceId?: string;
}

// ===== Send result ==========================================================

export interface ISendResult {
  /** Canonical provider message id (meta wamid / evolution key id / mock-...). */
  providerMessageId: string;
  status: "queued" | "sent";
  estimatedDeliveryAt?: ISO8601;
}

// ===== Inbound (webhook utilities) =========================================

export interface IInboundMessage {
  type: "message";
  providerMessageId: string;
  /** Sender phone in E.164. */
  fromPhone: string;
  /** Receiving account phone in E.164 — used to resolve `accountId`. */
  toAccountPhone: string;
  /** `whatsapp_accounts.id` resolved from `toAccountPhone`. */
  accountId: string;
  contentType: InboundContentType;
  text?: string;
  /** Provider media id, downloadable via `downloadInboundMedia`. */
  mediaId?: string;
  mediaCaption?: string;
  timestamp: ISO8601;
  /** Original provider payload, kept verbatim for audit (PRD-110). */
  rawPayload: unknown;
}

export interface IInboundStatus {
  type: "status";
  /** References the provider id of a previously sent outbound message. */
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  failureReason?: string;
  timestamp: ISO8601;
  rawPayload: unknown;
}

// ===== Media ================================================================

export interface IMediaDownloadResult {
  /** Raw bytes of the media object. */
  data: Uint8Array;
  mimeType: string;
  /** Size in bytes (length of `data`). */
  sizeBytes: number;
  filename?: string;
}

// ===== Health ===============================================================

export interface IHealthCheckResult {
  healthy: boolean;
  /** Round-trip latency of the probe, when measured. */
  latencyMs?: number;
  /** Provider-facing status detail — safe to log, never contains secrets. */
  detail?: string;
  checkedAt: ISO8601;
}

// ===== Capabilities =========================================================

/**
 * Static feature matrix of a provider implementation (PRD-111 RF-004).
 * Consumers branch on these flags — never on `providerName` directly.
 */
export interface IProviderCapabilities {
  supportsTemplates: boolean;
  supportsInteractive: boolean;
  supportsMediaUpload: boolean;
  /** delivered/read receipts via webhook statuses. */
  supportsStatusReadReceipts: boolean;
  /** Evolution allows a custom webhook URL; Meta does not. */
  supportsCustomWebhook: boolean;
  maxMessageLength: number;
  maxMediaSizeBytes: number;
}
