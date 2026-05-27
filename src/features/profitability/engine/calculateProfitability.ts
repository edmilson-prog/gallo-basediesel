import type { ICustomer, ID, IOrder, IOrderItem, IPart, ISeller } from "@/shared/types";
import type { PartCategory } from "@/shared/types/part-identification";

/** Dimensions supported by the profitability engine (PRD-049 RF-001). */
export type ProfitabilityDimension = "product" | "category" | "customer" | "seller";

/** Coarse health bucket bound to a margin percentage threshold. */
export type ProfitabilityHealth = "good" | "neutral" | "warning" | "critical";

/** Default thresholds (decimal share over revenue). */
export const PROFITABILITY_THRESHOLDS = {
  good: 0.35,
  neutral: 0.25,
} as const;

export function classifyMargin(marginPct: number): ProfitabilityHealth {
  if (marginPct < 0) return "critical";
  if (marginPct < PROFITABILITY_THRESHOLDS.neutral) return "warning";
  if (marginPct < PROFITABILITY_THRESHOLDS.good) return "neutral";
  return "good";
}

/** Common shape used by every aggregated row regardless of dimension. */
export interface IProfitabilityRowBase {
  /** Group identifier (partId / category / customerId / sellerId). */
  key: string;
  /** Label rendered on the table. */
  label: string;
  /** Total revenue contribution from this group (BRL). */
  revenue: number;
  /** Cost contribution computed from `item.unitCost * item.quantity` (BRL). */
  cost: number;
  /** Margin = revenue − cost (BRL). */
  margin: number;
  /** Decimal share of margin over revenue (0..1, may be negative). */
  marginPct: number;
  /** Number of orders that touched this group. */
  orderCount: number;
  /** Number of line items that touched this group. */
  itemCount: number;
  /** Cost coverage at the group level (0..1) — fraction of items with positive `unitCost`. */
  coverage: number;
  /** Visual classification derived from `marginPct`. */
  health: ProfitabilityHealth;
}

export interface IProductProfitabilityRow extends IProfitabilityRowBase {
  partId: ID;
  sku: string;
  category?: PartCategory;
  brand?: string;
  /** Snapshot of the catalog price (last sale snapshot). */
  unitPrice: number;
  /** Snapshot of the catalog cost. */
  unitCost: number;
  /** True when no cost snapshot exists across the period. */
  costMissing: boolean;
}

export interface ICategoryProfitabilityRow extends IProfitabilityRowBase {
  category: PartCategory | "outros";
  productCount: number;
}

export interface ICustomerProfitabilityRow extends IProfitabilityRowBase {
  customerId: ID;
  abcClass?: "A" | "B" | "C";
  sellerId?: ID;
  sellerName?: string;
}

export interface ISellerProfitabilityRow extends IProfitabilityRowBase {
  sellerId: ID;
  /** Average discount applied across orders (0..1). */
  avgDiscountPct: number;
}

export interface IProfitabilityCoverage {
  /** Fraction of items with positive `unitCost` (0..1). */
  pct: number;
  /** Absolute number of items missing cost. */
  missingItems: number;
  /** Distinct parts missing cost across the period. */
  missingParts: number;
  /** Total item count considered. */
  totalItems: number;
}

export interface IProfitabilitySummary {
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
  coverage: IProfitabilityCoverage;
  /** Count of groups with `marginPct < 0`. */
  negativeMarginCount: number;
  /** Count of groups with `marginPct < neutral threshold` (warning + critical). */
  underperformingCount: number;
}

export interface IProfitabilityEngineContext {
  paidOrders: IOrder[];
  partsById: Map<ID, IPart>;
  customersById: Map<ID, ICustomer>;
  sellersById: Map<ID, ISeller>;
}

interface IGroupBuffer {
  revenue: number;
  cost: number;
  orders: Set<ID>;
  itemCount: number;
  coveredItemCount: number;
  /** Extra payload — varies per dimension. */
  meta?: unknown;
}

const emptyBuffer = (): IGroupBuffer => ({
  revenue: 0,
  cost: 0,
  orders: new Set(),
  itemCount: 0,
  coveredItemCount: 0,
});

const round2 = (value: number): number => Math.round(value * 100) / 100;
const ratio = (n: number, d: number): number => (d === 0 ? 0 : n / d);

function itemRevenue(item: IOrderItem): number {
  // The order item already snapshots `total` = qty * price − discount.
  return item.total;
}

function itemCost(item: IOrderItem): number {
  return item.unitCost > 0 ? item.unitCost * item.quantity : 0;
}

function buildBase(key: string, label: string, buf: IGroupBuffer): IProfitabilityRowBase {
  const revenue = round2(buf.revenue);
  const cost = round2(buf.cost);
  const margin = round2(revenue - cost);
  const marginPct = ratio(margin, revenue);
  const coverage = ratio(buf.coveredItemCount, buf.itemCount);
  return {
    key,
    label,
    revenue,
    cost,
    margin,
    marginPct,
    orderCount: buf.orders.size,
    itemCount: buf.itemCount,
    coverage,
    health: classifyMargin(marginPct),
  };
}

/**
 * Compute coverage stats over every line item considered.
 */
export function calculateCoverage(orders: IOrder[]): IProfitabilityCoverage {
  let total = 0;
  let covered = 0;
  const missingParts = new Set<ID>();
  for (const order of orders) {
    for (const item of order.items) {
      total += 1;
      if (item.unitCost > 0) covered += 1;
      else missingParts.add(item.partId);
    }
  }
  return {
    pct: total === 0 ? 1 : covered / total,
    missingItems: total - covered,
    missingParts: missingParts.size,
    totalItems: total,
  };
}

/** Aggregate by product. */
export function profitabilityByProduct(
  ctx: IProfitabilityEngineContext,
): IProductProfitabilityRow[] {
  const buffers = new Map<ID, IGroupBuffer>();
  for (const order of ctx.paidOrders) {
    for (const item of order.items) {
      const buf = buffers.get(item.partId) ?? emptyBuffer();
      buf.revenue += itemRevenue(item);
      buf.cost += itemCost(item);
      buf.orders.add(order.id);
      buf.itemCount += 1;
      if (item.unitCost > 0) buf.coveredItemCount += 1;
      buffers.set(item.partId, buf);
    }
  }
  const rows: IProductProfitabilityRow[] = [];
  for (const [partId, buf] of buffers) {
    const part = ctx.partsById.get(partId);
    const label = part?.name ?? "(peça removida)";
    const base = buildBase(partId, label, buf);
    rows.push({
      ...base,
      partId,
      sku: part?.sku ?? "—",
      category: part?.category,
      brand: part?.brand,
      unitPrice: part?.unitPrice ?? 0,
      unitCost: part?.unitCost ?? 0,
      costMissing: !part || part.unitCost === 0 || buf.coveredItemCount === 0,
    });
  }
  return rows;
}

/** Aggregate by part category (using `IPart.category`). */
export function profitabilityByCategory(
  ctx: IProfitabilityEngineContext,
): ICategoryProfitabilityRow[] {
  const buffers = new Map<string, IGroupBuffer>();
  const productsByCategory = new Map<string, Set<ID>>();
  for (const order of ctx.paidOrders) {
    for (const item of order.items) {
      const part = ctx.partsById.get(item.partId);
      const category = (part?.category as PartCategory | undefined) ?? "outros";
      const buf = buffers.get(category) ?? emptyBuffer();
      buf.revenue += itemRevenue(item);
      buf.cost += itemCost(item);
      buf.orders.add(order.id);
      buf.itemCount += 1;
      if (item.unitCost > 0) buf.coveredItemCount += 1;
      buffers.set(category, buf);
      const set = productsByCategory.get(category) ?? new Set();
      set.add(item.partId);
      productsByCategory.set(category, set);
    }
  }
  const rows: ICategoryProfitabilityRow[] = [];
  for (const [category, buf] of buffers) {
    const base = buildBase(category, category, buf);
    rows.push({
      ...base,
      category: category as PartCategory | "outros",
      productCount: productsByCategory.get(category)?.size ?? 0,
    });
  }
  return rows;
}

/** Aggregate by customer. */
export function profitabilityByCustomer(
  ctx: IProfitabilityEngineContext,
): ICustomerProfitabilityRow[] {
  const buffers = new Map<ID, IGroupBuffer>();
  for (const order of ctx.paidOrders) {
    const buf = buffers.get(order.customerId) ?? emptyBuffer();
    buf.revenue += order.subtotal - order.discount;
    let orderCost = 0;
    for (const item of order.items) {
      orderCost += itemCost(item);
      buf.itemCount += 1;
      if (item.unitCost > 0) buf.coveredItemCount += 1;
    }
    buf.cost += orderCost;
    buf.orders.add(order.id);
    buffers.set(order.customerId, buf);
  }
  const rows: ICustomerProfitabilityRow[] = [];
  for (const [customerId, buf] of buffers) {
    const customer = ctx.customersById.get(customerId);
    const label = customer
      ? customer.type === "B2B"
        ? customer.nomeFantasia || customer.razaoSocial
        : customer.fullName
      : "(cliente removido)";
    const seller = customer ? ctx.sellersById.get(customer.sellerId) : undefined;
    const base = buildBase(customerId, label, buf);
    rows.push({
      ...base,
      customerId,
      abcClass: customer?.abcClass,
      sellerId: customer?.sellerId,
      sellerName: seller?.fullName,
    });
  }
  return rows;
}

/** Aggregate by seller. */
export function profitabilityBySeller(ctx: IProfitabilityEngineContext): ISellerProfitabilityRow[] {
  const buffers = new Map<ID, IGroupBuffer & { discountTotal: number; subtotalTotal: number }>();
  for (const order of ctx.paidOrders) {
    const existing = buffers.get(order.sellerId);
    const buf = existing ?? { ...emptyBuffer(), discountTotal: 0, subtotalTotal: 0 };
    buf.revenue += order.subtotal - order.discount;
    let orderCost = 0;
    for (const item of order.items) {
      orderCost += itemCost(item);
      buf.itemCount += 1;
      if (item.unitCost > 0) buf.coveredItemCount += 1;
    }
    buf.cost += orderCost;
    buf.orders.add(order.id);
    buf.discountTotal += order.discount;
    buf.subtotalTotal += order.subtotal;
    buffers.set(order.sellerId, buf);
  }
  const rows: ISellerProfitabilityRow[] = [];
  for (const [sellerId, buf] of buffers) {
    const seller = ctx.sellersById.get(sellerId);
    const label = seller?.fullName ?? "(vendedor removido)";
    const base = buildBase(sellerId, label, buf);
    rows.push({
      ...base,
      sellerId,
      avgDiscountPct: ratio(buf.discountTotal, buf.subtotalTotal),
    });
  }
  return rows;
}

/** Compute the consolidated summary across every paid order. */
export function profitabilitySummary(ctx: IProfitabilityEngineContext): IProfitabilitySummary {
  let revenue = 0;
  let cost = 0;
  for (const order of ctx.paidOrders) {
    revenue += order.subtotal - order.discount;
    for (const item of order.items) {
      cost += itemCost(item);
    }
  }
  const coverage = calculateCoverage(ctx.paidOrders);
  const productRows = profitabilityByProduct(ctx);
  const negativeMarginCount = productRows.filter((r) => r.marginPct < 0).length;
  const underperformingCount = productRows.filter(
    (r) => r.marginPct < PROFITABILITY_THRESHOLDS.neutral,
  ).length;
  return {
    revenue: round2(revenue),
    cost: round2(cost),
    margin: round2(revenue - cost),
    marginPct: ratio(revenue - cost, revenue),
    coverage,
    negativeMarginCount,
    underperformingCount,
  };
}

/**
 * Single-call dispatcher when the dimension is dynamic (e.g. driven by a tab
 * selector). Prefer the dedicated `profitabilityBy*` helpers when the
 * dimension is known at compile time.
 */
export function calculateProfitability(
  dimension: ProfitabilityDimension,
  ctx: IProfitabilityEngineContext,
): IProfitabilityRowBase[] {
  switch (dimension) {
    case "product":
      return profitabilityByProduct(ctx);
    case "category":
      return profitabilityByCategory(ctx);
    case "customer":
      return profitabilityByCustomer(ctx);
    case "seller":
      return profitabilityBySeller(ctx);
  }
}
