/**
 * ABC Curve feature barrel (PRD-045).
 *
 * Pareto-based customer classification: aggregates paid orders in a configurable
 * rolling window, ranks customers by revenue, splits into classes A/B/C using
 * cumulative-share cutoffs (default 80/95), and detects migrations vs the
 * previous window. Settings live on `IPlatformSettings.abcCurveSettings` and
 * are managed by Owner via the dedicated admin page.
 *
 * Surfaces:
 *  - `/app/gestao/abc` — main page (`ABCCurvePage`)
 *  - `/app/gestao/abc/$class` — drill-down by class (`ABCClassPage`)
 *  - `/app/configuracoes/curva-abc` — admin (`ABCSettingsPage`, Owner only)
 *
 * Consumed by: ProfileBadges (PRD-012, already integrated via `customer.abcClass`),
 * customers list filter (PRD-015, already integrated), and the Cockpit (PRD-040)
 * could swap its inline stub for `useABCClassification` in a future PR.
 */
export { ABCCurvePage } from "./pages/ABCCurvePage";
export { ABCClassPage } from "./pages/ABCClassPage";
export { ABCSettingsPage } from "./pages/ABCSettingsPage";
export { useABCClassification } from "./hooks/useABCClassification";
export {
  useABCFilters,
  validateABCSearch,
  resolveABCWindow,
  presetMonths,
  DEFAULT_ABC_FILTERS,
} from "./hooks/useABCFilters";
export type {
  ABCPeriodPreset,
  IABCFiltersState,
  IABCFiltersSearch,
  IABCWindow,
  IUseABCFiltersResult,
} from "./hooks/useABCFilters";
export type { IUseABCClassificationResult } from "./hooks/useABCClassification";
export { classifyABC } from "./engine/classifyABC";
export { detectMigrations } from "./engine/detectMigrations";
export type {
  ICustomerABCRecord,
  ICustomerABCWithMigration,
  IABCMetrics,
  IABCClassBucket,
  IABCMigrationsBucket,
  IClassifyABCContext,
  ABCMigration,
} from "./engine/classifyABC";
