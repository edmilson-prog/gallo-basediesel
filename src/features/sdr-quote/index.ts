/**
 * SDR-quote feature barrel (PRD-022).
 *
 * Exposes the pure quote pipeline — generation, shipping placeholder, message
 * rendering and customer-reply parser. The SDR engine (PRD-020) wires
 * everything via the `context.parts` / `context.customer` it already plumbs.
 */
export {
  generateSdrQuote,
  type IGenerateSdrQuoteInput,
  type IGenerateSdrQuoteResult,
} from "./engine/generate";

export { calculateShippingPlaceholder, calculateShippingPlaceholderFor } from "./engine/shipping";

export { parseQuoteResponse } from "./engine/parse-response";

export {
  buildQuoteVariables,
  renderTemplate,
  renderQuoteMessage,
  renderAcceptMessage,
  renderRejectMessage,
  renderEscalateMessage,
  type IQuoteTemplateVariables,
} from "./templates/render";

export { DEFAULT_SDR_QUOTE_TEMPLATES } from "./templates/defaults";

export {
  useSdrQuoteMetrics,
  type ISdrQuoteMetrics,
  type ISdrQuoteMetricsFilters,
} from "./hooks/useSdrQuoteMetrics";
