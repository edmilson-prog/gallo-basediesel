import type {
  ID,
  IInventoryAnalysis,
  IInventoryAnalysisSettings,
  IInventoryMetrics,
  IInventoryReorderSuggestion,
  InventoryCurve,
  InventoryStatus,
  IOrder,
  IPart,
} from "@/shared/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const round2 = (value: number): number => Math.round(value * 100) / 100;

const ratio = (n: number, d: number): number => (d === 0 ? 0 : n / d);

interface IConsumptionSnapshot {
  /** Total quantity consumed in the analysis window. */
  consumption: number;
  /** Days since the last paid sale of this part — null when never sold. */
  daysSinceLastSale: number | null;
  /** Distinct days inside the window with at least one sale. */
  activeDays: number;
}

function buildConsumptionIndex(
  paidOrders: IOrder[],
  windowStart: number,
  now: Date,
): Map<ID, IConsumptionSnapshot> {
  const out = new Map<ID, IConsumptionSnapshot>();
  // Track per-part: total qty, days active in window, last sale ts
  const acc = new Map<ID, { consumption: number; days: Set<string>; lastSaleMs: number | null }>();
  for (const order of paidOrders) {
    const tsString = order.paidAt ?? order.updatedAt;
    if (!tsString) continue;
    const ts = new Date(tsString).getTime();
    if (Number.isNaN(ts)) continue;
    const dayKey = tsString.slice(0, 10);
    for (const item of order.items) {
      const bucket = acc.get(item.partId) ?? {
        consumption: 0,
        days: new Set<string>(),
        lastSaleMs: null,
      };
      if (ts >= windowStart) {
        bucket.consumption += item.quantity;
        bucket.days.add(dayKey);
      }
      bucket.lastSaleMs = bucket.lastSaleMs == null ? ts : Math.max(bucket.lastSaleMs, ts);
      acc.set(item.partId, bucket);
    }
  }
  for (const [partId, bucket] of acc) {
    out.set(partId, {
      consumption: bucket.consumption,
      daysSinceLastSale:
        bucket.lastSaleMs == null
          ? null
          : Math.floor((now.getTime() - bucket.lastSaleMs) / MS_PER_DAY),
      activeDays: bucket.days.size,
    });
  }
  return out;
}

function classifyCurve(
  coverageInDays: number,
  consumption: number,
  daysSinceLastSale: number | null,
  windowDays: number,
): InventoryCurve {
  // Sem vendas no período recente: baixo giro.
  if (consumption === 0 || (daysSinceLastSale != null && daysSinceLastSale > 60)) {
    return "Z";
  }
  // Alto giro: cobertura curta (vende rápido) E consumo significativo.
  if (coverageInDays < 30 && consumption >= Math.max(5, windowDays / 30)) {
    return "X";
  }
  // Médio giro padrão.
  if (coverageInDays <= 90) return "Y";
  return "Z";
}

function classifyStatus(
  stockQuantity: number,
  stockMinThreshold: number,
  coverageInDays: number,
  curve: InventoryCurve,
  excessCoverageDays: number,
): InventoryStatus {
  if (stockQuantity === 0 || coverageInDays < 5) return "critico";
  if (stockQuantity < stockMinThreshold || coverageInDays < 15) return "baixo";
  if (curve === "Z" && coverageInDays > excessCoverageDays) return "excesso";
  return "ok";
}

function suggestReorder(
  status: InventoryStatus,
  averageDailyConsumption: number,
  stockQuantity: number,
  stockMinThreshold: number,
  unitCost: number,
  settings: IInventoryAnalysisSettings,
): IInventoryReorderSuggestion | undefined {
  if (status !== "critico" && status !== "baixo") return undefined;
  const targetByCoverage = Math.ceil(averageDailyConsumption * settings.targetCoverageDays);
  const suggestedQuantity = Math.max(stockMinThreshold, targetByCoverage, 1);
  const estimatedCostToReorder = round2(suggestedQuantity * unitCost);
  const coverageNow =
    averageDailyConsumption > 0 ? (stockQuantity / averageDailyConsumption).toFixed(1) : "—";
  const rationale = `Consumo médio: ${averageDailyConsumption.toFixed(2)}/dia. Estoque atual: ${stockQuantity} (cobertura ${coverageNow} dias). Sugestão: repor para ${settings.targetCoverageDays} dias de cobertura.`;
  return { suggestedQuantity, estimatedCostToReorder, rationale };
}

export interface IInventoryEngineContext {
  parts: IPart[];
  /** Paid orders covering at least the consumption window. */
  paidOrders: IOrder[];
  settings: IInventoryAnalysisSettings;
  storeId: ID;
  /** Injected `now` for deterministic tests. */
  now?: Date;
}

/**
 * Pure engine — projects each `IPart` into an `IInventoryAnalysis` row given
 * the paid-order history and the user-configured thresholds (PRD-050 RF-001).
 */
export function calculateInventoryAnalysis(ctx: IInventoryEngineContext): IInventoryAnalysis[] {
  const now = ctx.now ?? new Date();
  const windowStart = now.getTime() - ctx.settings.consumptionWindowDays * MS_PER_DAY;
  const consumptionIndex = buildConsumptionIndex(ctx.paidOrders, windowStart, now);

  const rows: IInventoryAnalysis[] = [];
  for (const part of ctx.parts) {
    if (!part.active) continue;
    const snap = consumptionIndex.get(part.id) ?? {
      consumption: 0,
      daysSinceLastSale: null,
      activeDays: 0,
    };
    const consumption = snap.consumption;
    const averageDailyConsumption = round2(consumption / ctx.settings.consumptionWindowDays);
    const coverageInDays =
      averageDailyConsumption > 0
        ? round2(part.stockAvailable / averageDailyConsumption)
        : part.stockAvailable === 0
          ? 0
          : Number.POSITIVE_INFINITY;
    const curve = classifyCurve(
      coverageInDays,
      consumption,
      snap.daysSinceLastSale,
      ctx.settings.consumptionWindowDays,
    );
    const status = classifyStatus(
      part.stockAvailable,
      part.stockMinimum,
      coverageInDays,
      curve,
      ctx.settings.excessCoverageDays,
    );
    const reorder = suggestReorder(
      status,
      averageDailyConsumption,
      part.stockAvailable,
      part.stockMinimum,
      part.unitCost,
      ctx.settings,
    );
    rows.push({
      partId: part.id,
      partName: part.name,
      partSku: part.sku,
      partOemCode: part.oemCodes[0],
      category: part.category,
      brand: part.brand,
      unitCost: part.unitCost,
      unitPrice: part.unitPrice,
      stockQuantity: part.stockAvailable,
      stockMinThreshold: part.stockMinimum,
      consumptionLastWindow: consumption,
      averageDailyConsumption,
      daysSinceLastSale: snap.daysSinceLastSale,
      coverageInDays,
      curve,
      status,
      recommendedReorder: reorder,
      capitalTied: round2(part.stockAvailable * (part.unitCost || 0)),
      storeId: ctx.storeId,
    });
  }
  return rows;
}

/** Aggregate KPI helper for the page header + cockpit consumption. */
export function calculateInventoryMetrics(analyses: IInventoryAnalysis[]): IInventoryMetrics {
  const byStatus: Record<InventoryStatus, number> = { ok: 0, baixo: 0, critico: 0, excesso: 0 };
  const byCurve: Record<InventoryCurve, number> = { X: 0, Y: 0, Z: 0 };
  let totalCapitalTied = 0;
  let capitalInExcess = 0;
  let withCost = 0;
  for (const a of analyses) {
    byStatus[a.status] += 1;
    byCurve[a.curve] += 1;
    totalCapitalTied += a.capitalTied;
    if (a.status === "excesso") capitalInExcess += a.capitalTied;
    if (a.unitCost > 0) withCost += 1;
  }
  const criticalProducts = analyses
    .filter((a) => a.status === "critico")
    .sort((a, b) => b.consumptionLastWindow - a.consumptionLastWindow);
  const reorderSuggestions = analyses
    .filter((a) => a.recommendedReorder != null)
    .sort((a, b) => {
      const order: Record<InventoryStatus, number> = {
        critico: 0,
        baixo: 1,
        ok: 2,
        excesso: 3,
      };
      const diff = order[a.status] - order[b.status];
      if (diff !== 0) return diff;
      return b.consumptionLastWindow - a.consumptionLastWindow;
    });
  const excessProducts = analyses
    .filter((a) => a.status === "excesso")
    .sort((a, b) => b.capitalTied - a.capitalTied);
  return {
    totalProducts: analyses.length,
    byStatus,
    byCurve,
    totalCapitalTied: round2(totalCapitalTied),
    capitalInExcess: round2(capitalInExcess),
    costCoverage: ratio(withCost, analyses.length),
    criticalProducts,
    reorderSuggestions,
    excessProducts,
  };
}
