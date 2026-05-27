/**
 * Profitability feature barrel (PRD-049).
 *
 * Compõe o engine puro `calculateProfitability` com os providers e expõe:
 *  - `/app/gestao/rentabilidade` — `ProfitabilityPage` com 4 abas
 *  - Hooks consumíveis pelo Cockpit Executivo (PRD-040) e pelo PRD-041
 *    (`useProfitabilityData`, `useProfitabilityAlerts`)
 */

export {
  calculateProfitability,
  calculateCoverage,
  profitabilityByProduct,
  profitabilityByCategory,
  profitabilityByCustomer,
  profitabilityBySeller,
  profitabilitySummary,
  classifyMargin,
  PROFITABILITY_THRESHOLDS,
} from "./engine";
export type {
  ProfitabilityDimension,
  ProfitabilityHealth,
  IProfitabilityRowBase,
  IProductProfitabilityRow,
  ICategoryProfitabilityRow,
  ICustomerProfitabilityRow,
  ISellerProfitabilityRow,
  IProfitabilityCoverage,
  IProfitabilitySummary,
  IProfitabilityEngineContext,
} from "./engine";

export { ProfitabilityPage } from "./pages/ProfitabilityPage";

export { useProfitabilityData } from "./hooks/useProfitabilityData";
export type {
  IProfitabilityFilters,
  IUseProfitabilityDataResult,
} from "./hooks/useProfitabilityData";

export { useProfitabilityAlerts } from "./hooks/useProfitabilityAlerts";

export {
  useProfitabilityFilters,
  validateProfitabilitySearch,
} from "./hooks/useProfitabilityFilters";
export type {
  IProfitabilityFiltersSearch,
  IProfitabilityFiltersState,
  IUseProfitabilityFiltersResult,
  ProfitabilityTab,
} from "./hooks/useProfitabilityFilters";
