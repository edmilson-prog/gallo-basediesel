/**
 * Positivation feature barrel (PRD-044).
 *
 * Strategic coverage metrics: who from the active base purchased in the
 * current period, who is missing, who is on the verge of going dormant,
 * by-seller breakdown, linear projection of the end-of-period rate.
 *
 * Surfaces:
 *  - `/app/gestao/positivacao` — main page (`PositivationPage`)
 *  - `/app/gestao/positivacao/$sellerId` — drill-down (`SellerPositivationPage`)
 *  - `<PositivationWidget />` — compact widget for the manager dashboard (PRD-014)
 *
 * Consumed by PRD-040 (cockpit) and PRD-042 (goals engine for `positivacao`).
 */
export { PositivationPage } from "./pages/PositivationPage";
export { SellerPositivationPage } from "./pages/SellerPositivationPage";
export { PositivationWidget } from "./components/PositivationWidget";
export { usePositivationMetrics } from "./hooks/usePositivationMetrics";
export {
  usePositivationFilters,
  validatePositivationSearch,
  resolvePositivationWindow,
  daysElapsedInWindow,
  totalDaysInWindow,
  DEFAULT_POSITIVATION_FILTERS,
} from "./hooks/usePositivationFilters";
export type {
  IPositivationFiltersState,
  IPositivationFiltersSearch,
  IPositivationWindow,
  PositivationPeriodPreset,
} from "./hooks/usePositivationFilters";
export type {
  IUsePositivationMetricsResult,
  IPositivationDailyPoint,
} from "./hooks/usePositivationMetrics";
export { calculatePositivation, describePositivationPeriod } from "./engine/calculatePositivation";
export type {
  IPositivationMetrics,
  ISellerPositivation,
  IAtRiskCustomer,
  IPositivationPeriod,
  ICalculatePositivationContext,
} from "./engine/calculatePositivation";
