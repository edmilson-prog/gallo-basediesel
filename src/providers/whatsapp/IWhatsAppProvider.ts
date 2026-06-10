/**
 * IWhatsAppProvider — unified contract for WhatsApp engines (PRD-111).
 *
 * Concrete implementations: MetaCloudProvider (PRD-112), EvolutionProvider
 * (PRD-113), MockWhatsAppProvider (this PRD — development/tests). Consumers
 * (webhook PRD-114, send pipeline PRD-115, templates PRD-116, 24h window
 * PRD-117, status tracking PRD-118, failover PRD-120) depend ONLY on this
 * interface, obtained via `getWhatsAppProvider(accountId)` from `./factory`.
 *
 * Design principles (PRD-111):
 * - lowest common denominator + `capabilities` flags for optional features;
 * - normalized types at the boundary; provider payloads live in `rawPayload`;
 * - canonical `providerMessageId` (never meta/evolution-specific names);
 * - every send accepts an optional `traceId` for end-to-end correlation;
 * - implementations are stateless per account and never log credentials.
 */

import type {
  IHealthCheckResult,
  IInboundMessage,
  IInboundStatus,
  IMediaDownloadResult,
  IProviderCapabilities,
  ISendInteractiveInput,
  ISendMediaInput,
  ISendResult,
  ISendTemplateInput,
  ISendTextInput,
  WhatsAppProviderEngine,
} from "./types";

export interface IWhatsAppProvider {
  readonly providerName: WhatsAppProviderEngine;

  /** Static feature matrix — fixed per implementation (RF-004). */
  readonly capabilities: IProviderCapabilities;

  // ===== Sending ============================================================
  sendText(input: ISendTextInput): Promise<ISendResult>;
  sendMedia(input: ISendMediaInput): Promise<ISendResult>;
  /** HSM template send (PRD-116). Check `capabilities.supportsTemplates`. */
  sendTemplate(input: ISendTemplateInput): Promise<ISendResult>;
  /** Buttons/list send. Check `capabilities.supportsInteractive`. */
  sendInteractive(input: ISendInteractiveInput): Promise<ISendResult>;

  // ===== Receiving (webhook utilities — PRD-114) ===========================
  /** Validates the webhook signature/token of the raw request body. */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  /**
   * Normalizes a raw webhook payload into a canonical inbound message or a
   * delivery-status update. Throws on payloads the provider cannot parse.
   */
  parseInboundMessage(rawPayload: unknown): IInboundMessage | IInboundStatus;

  // ===== Media ==============================================================
  /** Downloads an inbound media object by the provider's media id. */
  downloadInboundMedia(mediaId: string): Promise<IMediaDownloadResult>;
  /** Uploads outbound media, returning the provider media id to send with. */
  uploadOutboundMedia(data: Uint8Array, mimeType: string): Promise<{ mediaId: string }>;

  // ===== Health (PRD-120 failover input) ====================================
  healthCheck(): Promise<IHealthCheckResult>;
}
