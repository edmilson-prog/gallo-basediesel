/**
 * GALLO BASE DIESEL — Public surface of the DINTEC import provider layer
 * (PRD-121).
 *
 * Consumers (the upload UI from PRD-122, the import engine from PRD-123 and
 * the entity syncs from PRDs 124-126) obtain providers exclusively through
 * this barrel:
 *
 *   import { getDintecProvider } from "@/providers/dintec";
 *
 * @see ../../../docs/dev/dintec-providers.md
 */

export type { IDintecImportProvider } from "./IDintecImportProvider";
export type {
  DintecBatchContext,
  DintecHealthCheckResult,
  DintecImportBatch,
  DintecImportEntityKind,
  DintecImportSource,
  DintecProviderCapabilities,
  DintecProviderName,
  DintecRow,
  DintecValidationError,
  DintecValidationResult,
} from "./types";
export { DEFAULT_DINTEC_CAPABILITIES } from "./types";
export { DintecProviderError, type DintecErrorCode } from "./errors";
export { getDintecProvider, invalidateDintecProviderCache } from "./factory";
export { MockDintecProvider } from "./mock/MockDintecProvider";
