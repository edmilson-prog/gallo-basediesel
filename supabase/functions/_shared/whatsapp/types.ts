// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/types.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

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

/**
 * Local alias instead of importing `@/shared/types` on purpose: every file in
 * this layer is RUNTIME-AGNOSTIC (browser/Deno/Node) and uses only relative
 * imports, so PRDs 114/115 can mirror it byte-identical into
 * `supabase/functions/_shared/whatsapp/`.
 */
type ISO8601 = string;

/** Provider engines supported today. Extending = widening this union (PRD-111 RF-003). */
export type WhatsAppProviderEngine = "meta" | "evolution" | "evolution-go" | "openwa" | "mock";

/** Content kinds a normalized inbound message can carry. */
export type InboundContentType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "location"
  | "contact"
  | "unknown";

/** Media kinds accepted for outbound sends. */
export type OutboundMediaType = "image" | "audio" | "video" | "document";

/**
 * Inbound content types that map to a non-null `messages.media_type`
 * discriminator — the binary kinds plus the structured shares (location/contact,
 * which carry no bytes but still need the column so the UI renders a card).
 * SINGLE source of truth for the live webhook (`toMediaType`) and the history
 * importers, so a new structured type can't be added to one site and missed in
 * another (which would silently render the raw encoded text instead of a card).
 */
export const MEDIA_DISCRIMINATOR_TYPES = [
  "image",
  "audio",
  "video",
  "document",
  "location",
  "contact",
] as const;

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
  /** Original filename of an inbound document (Meta `document.filename`, Baileys `documentMessage.fileName`). */
  mediaFilename?: string;
  /**
   * Contact's WhatsApp profile name (Evolution `pushName` / Meta
   * `contacts[].profile.name`), when present. Lets auto-created customers be
   * named instead of falling back to the bare phone number.
   */
  senderName?: string;
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
  /** Semantic provider error code (e.g. Meta "131026") — PRD-118. */
  failureCode?: string;
  timestamp: ISO8601;
  rawPayload: unknown;
}

/**
 * Own-account message echo (Evolution `messages.upsert` with `fromMe=true`):
 * something the team sent FROM THE PHONE (or another client). The webhook
 * mirrors it into the conversation as an outbound message (PRD spec
 * 2026-06-11-whatsapp-real-inbox). App-sent messages also echo — consumers
 * dedup by `providerMessageId` before persisting.
 */
export interface IOutboundEcho {
  type: "outbound-echo";
  providerMessageId: string;
  /** Destination phone in E.164 (the chat the message was sent to). */
  toPhone: string;
  contentType: InboundContentType;
  text?: string;
  /** Provider media handle for download — same semantics as IInboundMessage.mediaId. */
  mediaId?: string;
  mediaCaption?: string;
  mediaFilename?: string;
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
  /** Separate media-upload step (Meta 2-step flow). Evolution sends by URL. */
  supportsMediaUpload: boolean;
  /** delivered/read receipts via webhook statuses. */
  supportsStatusReadReceipts: boolean;
  /** Evolution allows a custom webhook URL; Meta does not. */
  supportsCustomWebhook: boolean;
  maxMessageLength: number;
  maxMediaSizeBytes: number;
}

// ===== Engine construction (PRDs 112/113) ==================================

/**
 * Resolves a named secret (Edge Function secret in production, stub in tests).
 * Returns `undefined` when the secret is not configured — required secrets
 * make the engine throw; optional ones (e.g. Evolution webhook secret) fall
 * back gracefully.
 */
export type SecretResolver = (secretName: string) => Promise<string | undefined>;

/** One sanitized record of an outbound provider call (PRD-112 RF-120). */
export interface IIntegrationLogEntry {
  integrationName:
    | "whatsapp_meta"
    | "whatsapp_evolution"
    | "whatsapp_evolution_go"
    | "whatsapp_openwa";
  direction: "outbound" | "inbound";
  endpoint: string;
  httpStatus?: number;
  latencyMs: number;
  traceId?: string;
  /** Sanitized/truncated — never carries tokens or full binaries. */
  requestPayload?: unknown;
  responsePayload?: unknown;
  errorMessage?: string;
}

/** Persists an integration log entry. Failures are swallowed by the client. */
export type IntegrationLogSink = (entry: IIntegrationLogEntry) => void | Promise<void>;

/**
 * Dependencies injected into concrete engines. Server-side (Edge Functions —
 * PRDs 114/115) wires `Deno.env` + `public.integration_logs`; tests inject
 * stubs. Engines never reach for globals beyond `fetch`/`crypto`.
 */
export interface IEngineDeps {
  resolveSecret: SecretResolver;
  logIntegration?: IntegrationLogSink;
  /** Injectable for tests; defaults to `globalThis.fetch`. */
  fetchFn?: typeof fetch;
}

/** Non-secret Meta account config (`whatsapp_accounts.provider_config`). */
export interface IMetaAccountConfig {
  accountId: string;
  phoneNumberId: string;
  businessAccountId: string;
  /**
   * Secret-name PREFIX (`whatsapp_accounts.credentials_ref`). The engine
   * resolves `<ref>_ACCESS_TOKEN`, `<ref>_APP_SECRET`, `<ref>_VERIFY_TOKEN`.
   */
  credentialsRef: string;
}

/** Non-secret Evolution account config (`whatsapp_accounts.provider_config`). */
export interface IEvolutionAccountConfig {
  accountId: string;
  /** Base URL of the self-hosted Evolution API (e.g. https://evo.example.com). */
  baseUrl: string;
  instanceName: string;
  /** Prefix for `<ref>_API_KEY` and optional `<ref>_WEBHOOK_SECRET`. */
  credentialsRef: string;
}

/**
 * Non-secret Evolution Go account config (`whatsapp_accounts.provider_config`).
 * Unlike v2 (which keys by instance NAME in the path), Go identifies the
 * instance by `instanceId` (the uuid returned by `POST /instance/create`),
 * passed as the `instanceId` header. The global server key and the per-instance
 * token are secrets resolved from the Vault via `credentialsRef`.
 */
export interface IEvolutionGoAccountConfig {
  accountId: string;
  /** Base URL of the Evolution Go server (e.g. https://evogo.ailainteligente.com.br). */
  baseUrl: string;
  /** Instance uuid returned by /instance/create (provider_config.instanceId). */
  instanceId: string;
  /** Prefix for `<ref>_API_KEY` (global) and `<ref>_INSTANCE_TOKEN`. */
  credentialsRef: string;
}

/**
 * Non-secret OpenWA account config (`whatsapp_accounts.provider_config` only
 * carries `sessionId` — see 20260707140000_whatsapp_openwa_servers.sql).
 * Redundant/primary engine option for new stores/numbers (rmyndharis/OpenWA,
 * whatsapp-web.js-based), same VPS as evolution/evolution-go.
 *
 * Architecturally like Evolution Go, NOT classic Evolution: ONE global API
 * key authenticates an entire OpenWA SERVER for every session on it (confirmed
 * live 2026-07-07) — there is no separate per-instance token. `baseUrl` and
 * `apiKeySecretName` are therefore NOT stored on the account; the caller
 * resolves them from the `whatsapp_openwa_servers` registry via
 * `whatsapp_accounts.openwa_server_id` and merges them into providerConfig
 * before calling `buildWhatsAppEngine` (mirrors the evolution-go base_url
 * pre-resolution pattern in whatsapp-webhook/whatsapp-send).
 */
export interface IOpenWaAccountConfig {
  accountId: string;
  /** Resolved by the caller from `whatsapp_openwa_servers.base_url`. */
  baseUrl: string;
  /** Server-generated session id (`provider_config.sessionId`, from `POST /api/sessions`). */
  sessionId: string;
  /** Vault secret NAME (not the value) resolved by the caller from `whatsapp_openwa_servers.api_key_ref`. */
  apiKeySecretName: string;
}
