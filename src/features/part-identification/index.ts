/**
 * Part identification feature barrel (PRD-021).
 *
 * Exposes the keyword-based extractor, the catalog search stub, the decision
 * heuristic, the message formatter and the `identifyPart()` orchestrator —
 * every entry-point is pure so it can be replaced by an LLM-driven engine on
 * Fase 2 without changing consumers.
 */
export {
  extractAttributes,
  extractBrand,
  extractModel,
  extractYear,
  extractEngine,
  extractPartCategory,
  extractPartSubtype,
  extractOemCode,
  type IExtractContext,
  type IExtractResult,
  type IParseResult,
} from "./engine/extract";

export {
  searchCatalog,
  searchCatalogWithFallback,
  scoreCandidate,
  buildFallbackCandidates,
  inferPartCategoryFromName,
  SCORE_WEIGHTS,
} from "./engine/search";

export { decideAction } from "./engine/decide";

export {
  formatConfirmationMessage,
  parseCustomerChoice,
  PHOTO_PLACEHOLDER_MESSAGE,
  OEM_NOT_FOUND_MESSAGE,
} from "./engine/format";

export {
  identifyPart,
  applyCustomerChoice,
  type IIdentifyPartInput,
  type IIdentifyPartResult,
} from "./engine/identify";

export { BRANDS, BRAND_ALIASES_FLAT } from "./data/brands";
export { MODELS_BY_BRAND, ALL_MODELS } from "./data/models";
export { ENGINES_BY_BRAND, ALL_ENGINES } from "./data/engines";
export { PART_CATEGORY_ENTRIES, CATALOG_CATEGORY_TO_CANONICAL } from "./data/partCategories";
