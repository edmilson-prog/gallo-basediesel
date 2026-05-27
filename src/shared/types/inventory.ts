import type { ID, Money } from "./common";
import type { PartCategory } from "./part-identification";

/** Inventory turnover class (PRD-050). */
export type InventoryCurve = "X" | "Y" | "Z";

/** Inventory health bucket (PRD-050). */
export type InventoryStatus = "ok" | "baixo" | "critico" | "excesso";

/**
 * Per-part inventory analysis snapshot (PRD-050).
 *
 * Derived purely from `IPart.stockAvailable`, `IPart.stockMinimum`,
 * `IPart.unitCost` plus the consumption pulled from paid orders in the
 * analysis window — never persisted.
 */
export interface IInventoryAnalysis {
  partId: ID;
  partName: string;
  partSku: string;
  /** First OEM code from the part for quick reference. */
  partOemCode?: string;
  category?: PartCategory;
  brand?: string;
  unitCost: Money;
  unitPrice: Money;
  // Current stock
  stockQuantity: number;
  stockMinThreshold: number;
  // Consumption
  consumptionLastWindow: number;
  averageDailyConsumption: number;
  /** Days since the last paid sale of this part. `null` when never sold. */
  daysSinceLastSale: number | null;
  // Analysis outputs
  coverageInDays: number;
  curve: InventoryCurve;
  status: InventoryStatus;
  /** Reorder suggestion produced when status is `baixo` or `critico`. */
  recommendedReorder?: IInventoryReorderSuggestion;
  /** Capital tied = `stockQuantity * unitCost`. */
  capitalTied: Money;
  storeId: ID;
}

export interface IInventoryReorderSuggestion {
  suggestedQuantity: number;
  estimatedCostToReorder: Money;
  /** Human-readable explanation displayed in the UI tooltip. */
  rationale: string;
}

/**
 * Aggregated inventory KPIs over a set of `IInventoryAnalysis` rows (PRD-050).
 */
export interface IInventoryMetrics {
  totalProducts: number;
  byStatus: Record<InventoryStatus, number>;
  byCurve: Record<InventoryCurve, number>;
  totalCapitalTied: Money;
  capitalInExcess: Money;
  /** Cost coverage at the catalog level (0..1) — share of parts with `unitCost > 0`. */
  costCoverage: number;
  criticalProducts: IInventoryAnalysis[];
  reorderSuggestions: IInventoryAnalysis[];
  excessProducts: IInventoryAnalysis[];
}

/**
 * Configurable knobs that drive the engine (PRD-050 RF-018+).
 *
 * Lives inside `IPlatformSettings.inventoryAnalysisSettings`. Owner edits at
 * `/app/configuracoes/estoque-analise`.
 */
export interface IInventoryAnalysisSettings {
  /** Rolling window in days used to compute average daily consumption. Default 90. */
  consumptionWindowDays: number;
  /** Target coverage in days used by the reorder suggestion. Default 30. */
  targetCoverageDays: number;
  /** Coverage above which an item is flagged as `excesso`. Default 180. */
  excessCoverageDays: number;
}
