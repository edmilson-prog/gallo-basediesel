/**
 * Commissions feature barrel (PRD-047).
 *
 * Composes the pure engine over the existing data providers (orders, transfers,
 * goals, settings, commissions). Surfaces:
 *  - `/app/gestao/comissoes` — `CommissionsPage`
 *  - `/app/gestao/comissoes/$sellerId` — `SellerCommissionsPage`
 *  - `/app/configuracoes/comissoes` — `CommissionsConfigPage`
 *
 * Plus reusable bits:
 *  - `useCommissionMetrics(filters)` — consumed by the Executive Cockpit
 *    (PRD-040) and the manager dashboard (PRD-014).
 *  - `useCommissionForOrder(orderId)` — used by the order detail page to
 *    swap the PRD-032 preview for the real calculated commission.
 */

export { calculateCommission, determineCommissionBeneficiary, findApplicableRule } from "./engine";
export type {
  ICalculatedCommission,
  ICommissionBeneficiary,
  ICommissionEngineContext,
} from "./engine";

export { CommissionsPage } from "./pages/CommissionsPage";
export { SellerCommissionsPage } from "./pages/SellerCommissionsPage";
export { CommissionsConfigPage } from "./pages/CommissionsConfigPage";

export { useCommissionMetrics } from "./hooks/useCommissionMetrics";
export type {
  IUseCommissionMetricsParams,
  IUseCommissionMetricsResult,
  ISellerCommissionAggregate,
} from "./hooks/useCommissionMetrics";
export { useCommissionsList } from "./hooks/useCommissionsList";
export { useCommissionForOrder } from "./hooks/useCommissionForOrder";
export { useCommissionTrigger } from "./hooks/useCommissionTrigger";
export { useCommissionsFilters, validateCommissionsSearch } from "./hooks/useCommissionsFilters";
export type {
  ICommissionsFiltersSearch,
  ICommissionsFiltersState,
  IUseCommissionsFiltersResult,
} from "./hooks/useCommissionsFilters";

export { currentPeriod, previousPeriod, labelForPeriod, canClosePeriod } from "./utils/periods";

export { CommissionsWidget } from "./components/CommissionsWidget";
