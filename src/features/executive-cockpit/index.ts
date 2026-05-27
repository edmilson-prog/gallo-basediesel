/**
 * Executive Cockpit feature barrel (PRD-040).
 *
 * Strategic dashboard for Owner / Gestor / Financeiro — agregador de 11 KPIs
 * (faturamento, ticket médio, pedidos, margem, ativos, positivação, churn,
 * novos clientes, pipeline aberto, conversão e comissões), 4 gráficos macro
 * (faturamento+pedidos 12 meses, donut carteira, top vendedores, ABC mini),
 * comparativo lado a lado e alertas executivos.
 *
 * Consome hooks dos PRDs 041 (vendas), 042 (metas), 032 (pedidos), 031
 * (orçamentos) e 015 (clientes). PRDs 044/045/046/047/049 ficam como stubs no
 * agregador até serem implementados.
 */
export { ExecutiveCockpitPage } from "./pages/ExecutiveCockpitPage";
export { useCockpitMetrics } from "./hooks/useCockpitMetrics";
export { useCockpitAlerts } from "./hooks/useCockpitAlerts";
export {
  useCockpitFilters,
  validateCockpitSearch,
  resolveCockpitWindow,
} from "./hooks/useCockpitFilters";
export type {
  CockpitPeriodPreset,
  CockpitCompareBase,
  ICockpitFiltersState,
  ICockpitFiltersSearch,
  ICockpitWindow,
} from "./hooks/useCockpitFilters";
export type {
  IUseCockpitMetricsResult,
  ICockpitKpis,
  ICockpitKpi,
  IRevenueOrdersPoint,
  IPortfolioBucket,
  ITopSellerRow,
  IABCMiniRow,
} from "./hooks/useCockpitMetrics";
export type {
  ICockpitAlert,
  CockpitAlertSeverity,
  CockpitAlertKind,
} from "./hooks/useCockpitAlerts";
