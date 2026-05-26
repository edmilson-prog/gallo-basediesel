/**
 * SDR Dashboard feature barrel (PRD-024).
 *
 * Hub centralizado do agente SDR — 5 abas (visão geral, histórico, métricas,
 * templates, configurações). Consome hooks dos PRDs 020-023.
 */
export { SdrDashboardPage } from "./pages/SdrDashboardPage";
export { useSdrDashboardData } from "./hooks/useSdrDashboardData";
export { useSdrAlerts } from "./hooks/useSdrAlerts";
export type { ISdrAlert, SdrAlertSeverity } from "./hooks/useSdrAlerts";
export type { ISdrDashboardData } from "./hooks/useSdrDashboardData";
export type { ISdrDashboardFiltersState } from "./hooks/useSdrDashboardFilters";
