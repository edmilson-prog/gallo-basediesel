/**
 * Customer Service Analytics feature barrel (PRD-051).
 *
 * Compõe o engine puro `calculateCustomerServiceMetrics` com os providers e
 * expõe:
 *  - `/app/gestao/atendimento-analise` — `CustomerServiceAnalyticsPage` (4 abas)
 *  - `/app/gestao/atendimento-analise/$sellerId` — `SellerServicePage` (drill-down)
 */

export { calculateCustomerServiceMetrics, deltaPctOf } from "./engine";
export type { ICustomerServiceEngineContext, ServiceChannelKey } from "./engine";

export { CustomerServiceAnalyticsPage } from "./pages/CustomerServiceAnalyticsPage";
export { SellerServicePage } from "./pages/SellerServicePage";

export { useCustomerServiceMetrics } from "./hooks/useCustomerServiceMetrics";
export type {
  ICustomerServiceFilters,
  IUseCustomerServiceMetricsResult,
} from "./hooks/useCustomerServiceMetrics";

export { useCsaFilters, validateCsaSearch } from "./hooks/useCsaFilters";
export type {
  ICsaFiltersSearch,
  ICsaFiltersState,
  IUseCsaFiltersResult,
  CsaTab,
} from "./hooks/useCsaFilters";
