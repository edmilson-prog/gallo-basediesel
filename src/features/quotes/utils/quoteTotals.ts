import type { IQuote, IQuoteItem } from "@/shared/types";

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Recompute every total of a quote from its items + discount + shipping. */
export function recalculateQuote(
  items: IQuoteItem[],
  discount: number,
  shipping: number,
): Pick<IQuote, "subtotal" | "discount" | "shipping" | "total"> {
  const subtotal = round2(items.reduce((acc, it) => acc + it.total, 0));
  const safeDiscount = Math.max(0, Math.min(discount, subtotal));
  const safeShipping = Math.max(0, shipping);
  return {
    subtotal,
    discount: round2(safeDiscount),
    shipping: round2(safeShipping),
    total: round2(subtotal - safeDiscount + safeShipping),
  };
}

/** Discount as fraction over subtotal — used to decide whether approval is required. */
export function discountFraction(subtotal: number, discount: number): number {
  if (subtotal <= 0) return 0;
  return discount / subtotal;
}

/** True when discount exceeds the approval threshold (PRD-031 RF-028/029). */
export function requiresDiscountApproval(
  subtotal: number,
  discount: number,
  thresholdPct: number,
): boolean {
  return discountFraction(subtotal, discount) > thresholdPct + 1e-9;
}

/** Days remaining until `validUntil`. Negative means expired. */
export function daysUntil(validUntil: string, now: Date = new Date()): number {
  const ms = new Date(validUntil).getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export type ValidityBucket = "expired" | "critical" | "warning" | "ok";

export function validityBucket(validUntil: string, now: Date = new Date()): ValidityBucket {
  const days = daysUntil(validUntil, now);
  if (days < 0) return "expired";
  if (days <= 1) return "critical";
  if (days <= 3) return "warning";
  return "ok";
}
