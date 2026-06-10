/**
 * GALLO BASE DIESEL — Public surface of the WhatsApp provider layer (PRD-111).
 *
 * Consumers (app features, hooks and — once PRDs 112+ land — Edge Function
 * counterparts) obtain engines exclusively through this barrel:
 *
 *   import { getWhatsAppProvider } from "@/providers/whatsapp";
 *
 * @see ../../../docs/dev/whatsapp-providers.md
 */

export type { IWhatsAppProvider } from "./IWhatsAppProvider";
export type {
  WhatsAppProviderEngine,
  InboundContentType,
  OutboundMediaType,
  ISendTextInput,
  ISendMediaInput,
  ISendTemplateInput,
  ISendInteractiveInput,
  IInteractiveOption,
  ISendResult,
  IInboundMessage,
  IInboundStatus,
  IMediaDownloadResult,
  IHealthCheckResult,
  IProviderCapabilities,
} from "./types";
export {
  getWhatsAppProvider,
  invalidateWhatsAppProviderCache,
  WhatsAppAccountNotFoundError,
} from "./factory";
export { MockWhatsAppProvider, type IMockInboundPayload } from "./mock/MockWhatsAppProvider";
