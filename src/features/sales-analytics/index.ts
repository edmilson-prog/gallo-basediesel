/**
 * Sales Analytics feature barrel (PRD-041).
 *
 * Dashboard analítico multidimensional de vendas: 4 abas (Visão geral, Produtos,
 * Clientes, Funil), top rankings, sazonalidade year-over-year e funil de
 * conversão lead → orçamento → pedido. Consome PRDs 017, 030, 031, 032.
 */
export { SalesAnalyticsPage } from "./pages/SalesAnalyticsPage";
export { useSalesAnalytics } from "./hooks/useSalesAnalytics";
export { useFunnelMetrics } from "./hooks/useFunnelMetrics";
export { useSalesFilters, validateSalesSearch } from "./hooks/useSalesFilters";
export type {
  ISalesFiltersState,
  ISalesFiltersSearch,
  SalesPeriodPreset,
  SalesChannel,
} from "./hooks/useSalesFilters";
export type {
  IUseSalesAnalyticsResult,
  ISalesKpis,
  ITopProductRow,
  ITopCustomerRow,
  IRevenueMonthlyPoint,
  ICategoryBreakdownItem,
  IVehicleBrandBreakdownItem,
  IChannelBreakdownItem,
  INewVsRecurringSnapshot,
} from "./hooks/useSalesAnalytics";
export type { IFunnelStage, IUseFunnelMetricsResult } from "./hooks/useFunnelMetrics";
