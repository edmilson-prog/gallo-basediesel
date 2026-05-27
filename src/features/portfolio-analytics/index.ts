/**
 * Portfolio Analytics feature barrel (PRD-046).
 *
 * Strategic view of portfolio health — status distribution (ativo / dormente /
 * perdido / recuperação), temporal evolution, churn & recovery transitions in
 * the window, at-risk lists and a per-seller breakdown including a composite
 * health score. Complements PRD-044 (positivation = binary "purchased this
 * month?") and PRD-045 (ABC = revenue ranking) with the *temporal + state*
 * dimension.
 *
 * Surfaces:
 *  - `/app/gestao/carteira-analitica` — main page (`PortfolioAnalyticsPage`)
 *  - `/app/gestao/carteira-analitica/$sellerId` — drill-down (`SellerPortfolioPage`)
 *  - `<PortfolioHealthWidget />` — compact widget for the manager dashboard (PRD-014)
 */
export { PortfolioAnalyticsPage } from "./pages/PortfolioAnalyticsPage";
export { SellerPortfolioPage } from "./pages/SellerPortfolioPage";
export { PortfolioHealthWidget } from "./components/PortfolioHealthWidget";
export { PortfolioHealthBadge } from "./components/PortfolioHealthBadge";
export { usePortfolioMetrics } from "./hooks/usePortfolioMetrics";
export { useSellerPortfolio } from "./hooks/useSellerPortfolio";
export {
  usePortfolioFilters,
  validatePortfolioSearch,
  resolvePortfolioWindow,
  DEFAULT_PORTFOLIO_FILTERS,
} from "./hooks/usePortfolioFilters";
export type {
  IPortfolioFiltersState,
  IPortfolioFiltersSearch,
  IPortfolioWindow,
  PortfolioPeriodPreset,
} from "./hooks/usePortfolioFilters";
export type {
  IUsePortfolioMetricsResult,
  IPortfolioEvolutionPoint,
} from "./hooks/usePortfolioMetrics";
export {
  calculatePortfolioMetrics,
  calculateHealthScore,
  describeHealthScore,
} from "./engine/calculatePortfolioMetrics";
export type {
  IPortfolioMetrics,
  ISellerPortfolio,
  IChurnData,
  IRecoveryData,
  IAtRiskCustomer,
  IPortfolioByStatus,
  IPortfolioRiskBuckets,
  ICalculatePortfolioContext,
  HealthQualitative,
} from "./engine/calculatePortfolioMetrics";
