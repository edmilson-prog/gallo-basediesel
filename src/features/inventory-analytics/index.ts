/**
 * Inventory Analytics feature barrel (PRD-050).
 *
 * Compõe o engine puro `calculateInventoryAnalysis` com os providers para
 * expor:
 *  - `/app/gestao/estoque` — `InventoryAnalyticsPage` com 4 abas
 *  - `/app/configuracoes/estoque-analise` — `InventoryAnalysisConfigPage`
 *  - `useInventoryAnalysis(filters)` — consumível pelo Cockpit Executivo
 */

export { calculateInventoryAnalysis, calculateInventoryMetrics } from "./engine";
export type { IInventoryEngineContext } from "./engine";

export { InventoryAnalyticsPage } from "./pages/InventoryAnalyticsPage";
export { InventoryAnalysisConfigPage } from "./pages/InventoryAnalysisConfigPage";

export { useInventoryAnalysis } from "./hooks/useInventoryAnalysis";
export type { IInventoryFilters, IUseInventoryAnalysisResult } from "./hooks/useInventoryAnalysis";

export { useInventoryFilters, validateInventorySearch } from "./hooks/useInventoryFilters";
export type {
  IInventoryFiltersSearch,
  IInventoryFiltersState,
  IUseInventoryFiltersResult,
  InventoryTab,
} from "./hooks/useInventoryFilters";
