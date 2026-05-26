import type { ICommissionPreview, IOrder, IPlatformSettings } from "@/shared/types";

/**
 * Default commission rate used when no per-seller / per-store override is
 * configured. PRD-032 RF-025 / PRD-047 will replace this with the proper
 * rule resolution.
 */
export const DEFAULT_COMMISSION_RATE = 0.03;

/**
 * Compute the commission preview for an order (PRD-032 RF-025).
 *
 * The MVP rule is intentionally simple: rate applied over `subtotal - discount`
 * (no shipping). PRD-047 will replace this helper with the definitive rules
 * (tiers, splits, goal multipliers, etc).
 */
export function computeCommissionPreview(
  order: Pick<IOrder, "subtotal" | "discount">,
  settings?: Pick<IPlatformSettings, "storeId"> | null,
): ICommissionPreview {
  const baseValue = round(Math.max(0, order.subtotal - order.discount));
  const commissionRate = DEFAULT_COMMISSION_RATE;
  const estimatedCommission = round(baseValue * commissionRate);
  const rules: string[] = [
    `Taxa padrão da loja: ${formatPct(commissionRate)}`,
    "Base = subtotal − desconto (sem frete)",
  ];
  if (settings) {
    rules.push("Cálculo definitivo no PRD-047 (Onda 2).");
  }
  return {
    baseValue,
    commissionRate,
    estimatedCommission,
    rules,
    finalCalculationInPRD047: true,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1).replace(/\.0$/, "")}%`;
}
