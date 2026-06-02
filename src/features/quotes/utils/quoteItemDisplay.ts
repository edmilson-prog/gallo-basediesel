// src/features/quotes/utils/quoteItemDisplay.ts
import type { ID, IPart, IQuoteItem } from "@/shared/types";
import { round2 } from "./quoteTotals";
import { FREE_ITEM_PART_ID } from "./quoteItemOps";

export type StockTone = "ok" | "low" | "out";

export interface IStockBadge {
  tone: StockTone;
  /** Short label, e.g. "12 em estoque", "3 (baixo)", "sem estoque". */
  label: string;
  /** Text color class for the label. */
  textClassName: string;
  /** Background+text classes for a small dot/pill. */
  dotClassName: string;
}

/**
 * Three-state stock badge for a part. Out-of-stock is a warning, not a block:
 * the part can still be sold on back-order ("sob encomenda").
 */
export function stockBadge(part: IPart): IStockBadge {
  if (part.stockAvailable <= 0) {
    return {
      tone: "out",
      label: "sem estoque",
      textClassName: "text-destructive",
      dotClassName: "bg-destructive",
    };
  }
  if (part.stockAvailable <= part.stockMinimum) {
    return {
      tone: "low",
      label: `${part.stockAvailable} (baixo)`,
      textClassName: "text-amber-600 dark:text-amber-400",
      dotClassName: "bg-amber-500",
    };
  }
  return {
    tone: "ok",
    label: `${part.stockAvailable} em estoque`,
    textClassName: "text-muted-foreground",
    dotClassName: "bg-emerald-500",
  };
}

/**
 * Monetary gross margin of a single quote line, using the part's cost.
 * Falls back to `unitCost` when `averageCost` is absent. Uses the item's
 * snapshot `unitPrice`/`discount` so it reflects what is actually quoted.
 * Returns 0 when the part is not resolvable (e.g. free items).
 */
export function lineMarginValue(item: IQuoteItem, part: IPart | undefined): number {
  if (!part || item.partId === FREE_ITEM_PART_ID) return 0;
  const cost = part.averageCost ?? part.unitCost;
  return round2((item.unitPrice - cost) * item.quantity - item.discount);
}

export interface IQuoteAggregates {
  /** Σ weightKg * quantity (kg). Parts without weight contribute 0. */
  totalWeightKg: number;
  /** Σ monetary line margin (BRL). */
  totalMargin: number;
  /** totalMargin / subtotal (0..1); 0 when subtotal <= 0. */
  marginPct: number;
}

/** Aggregate weight and margin across the quote, resolving parts by id. */
export function quoteAggregates(
  items: IQuoteItem[],
  partsById: Map<ID, IPart>,
  subtotal: number,
): IQuoteAggregates {
  let totalWeightKg = 0;
  let totalMargin = 0;
  for (const item of items) {
    const part = partsById.get(item.partId);
    if (part?.weightKg) totalWeightKg += part.weightKg * item.quantity;
    totalMargin += lineMarginValue(item, part);
  }
  totalWeightKg = round2(totalWeightKg);
  totalMargin = round2(totalMargin);
  return {
    totalWeightKg,
    totalMargin,
    marginPct: subtotal > 0 ? totalMargin / subtotal : 0,
  };
}
