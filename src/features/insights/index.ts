/**
 * Insights / IA Analítica feature barrel (PRD-053).
 *
 * Provides the daily-detection engine, the `/app/insights` hub, the cockpit
 * banner + manager-dashboard widget, and the per-store configuration page.
 */

export { detectInsights } from "./engine";
export type { IInsightsContext } from "./engine";

export { InsightsHubPage } from "./pages/InsightsHubPage";
export { InsightsConfigPage } from "./pages/InsightsConfigPage";

export { CriticalInsightsWidget } from "./components/CriticalInsightsWidget";
export type { ICriticalInsightsWidgetProps } from "./components/CriticalInsightsWidget";
export { InsightsBanner } from "./components/InsightsBanner";
export type { IInsightsBannerProps } from "./components/InsightsBanner";

export { useInsightsDailyDetection } from "./hooks/useInsightsDailyDetection";
export type { IUseInsightsDailyDetectionResult } from "./hooks/useInsightsDailyDetection";

export { useInsightsFilters, validateInsightsSearch } from "./hooks/useInsightsFilters";
export type {
  IInsightsSearch,
  IInsightsFiltersState,
  IUseInsightsFiltersResult,
  InsightPeriod,
  InsightTab,
} from "./hooks/useInsightsFilters";

export { useDismissalsStore } from "./store/dismissalsStore";
