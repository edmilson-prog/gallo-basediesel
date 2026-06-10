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
  SecretResolver,
  IIntegrationLogEntry,
  IntegrationLogSink,
  IEngineDeps,
  IMetaAccountConfig,
  IEvolutionAccountConfig,
} from "./types";
export { WhatsAppProviderError, type WhatsAppErrorCode } from "./errors";
export {
  getWhatsAppProvider,
  getEngineCapabilities,
  invalidateWhatsAppProviderCache,
  WhatsAppAccountNotFoundError,
} from "./factory";
export { buildWhatsAppEngine, type IBuildEngineInput } from "./build";
export { MetaCloudProvider } from "./meta/MetaCloudProvider";
export { EvolutionProvider } from "./evolution/EvolutionProvider";
export { MockWhatsAppProvider, type IMockInboundPayload } from "./mock/MockWhatsAppProvider";
