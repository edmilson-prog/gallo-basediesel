/**
 * DRE feature barrel (PRD-048).
 *
 * Composes the pure engine (`calculateDRE`) over the data providers and
 * surfaces:
 *  - `/app/gestao/dre` — `DREPage`
 *  - `/app/configuracoes/financeiro` — `FinancialConfigPage`
 *
 * Plus reusable bits:
 *  - `useDREData(params)` — fetches + calculates DRE for a period, used by the
 *    page and by PRD-040 (Executive Cockpit) widgets.
 *  - `useDREAlerts(dre)` — derives the alerts list from a `IDREPeriod`.
 */

export { calculateDRE, calculateDRETrend } from "./engine";
export type { IDREEngineContext } from "./engine";

export { DREPage } from "./pages/DREPage";
export { FinancialConfigPage } from "./pages/FinancialConfigPage";

export { useDREData, buildMonthOptions, resolvePeriodBounds } from "./hooks/useDREData";
export type { IUseDREDataParams, IUseDREDataResult, DREPeriodKind } from "./hooks/useDREData";
export { useDREAlerts } from "./hooks/useDREAlerts";
