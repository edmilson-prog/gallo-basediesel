import type { IPart, IPartSupplier, IPriceTable } from "@/shared/types";

export interface IPriceChannel {
  id: string;
  label: string;
  /** Offset added to the base (Padrão) markup, as a decimal. */
  offset: number;
}

/**
 * Price channels mirroring the DINTEC "Cadastro de Valores". The Padrão table
 * anchors to the part's own margin; the others are relative offsets. When the
 * Padrão markup is 1.20 these reproduce the ERP's 140/120/100/80/60 ladder.
 */
export const PRICE_CHANNELS: IPriceChannel[] = [
  { id: "padrao", label: "Padrão", offset: 0 },
  { id: "ecommerce", label: "Ecommerce", offset: 0.2 },
  { id: "oficina", label: "Oficina", offset: -0.2 },
  { id: "varejo", label: "Varejo", offset: -0.4 },
  { id: "atacado", label: "Atacado", offset: -0.6 },
];

/** Floor so deep-discount channels never go below a 5% markup. */
const MIN_MARKUP = 0.05;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Final price for a base cost and a markup (decimal). */
export function computePrice(baseCost: number, markupPercent: number): number {
  return round2(baseCost * (1 + markupPercent));
}

/**
 * Build the 5 price tables from a base cost and the part's base (Padrão) markup.
 * `padrao.price === computePrice(baseCost, baseMarkup)`.
 */
export function buildPriceTables(baseCost: number, baseMarkup: number): IPriceTable[] {
  return PRICE_CHANNELS.map((channel) => {
    const markup = Math.max(MIN_MARKUP, baseMarkup + channel.offset);
    return {
      id: channel.id,
      label: channel.label,
      markupPercent: Number(markup.toFixed(4)),
      price: computePrice(baseCost, markup),
    };
  });
}

/** Weighted average cost (C.M.) across supplier entries; null when no quantity. */
export function weightedAverageCost(suppliers: IPartSupplier[]): number | null {
  const totalQty = suppliers.reduce((sum, s) => sum + s.quantity, 0);
  if (totalQty <= 0) return null;
  const weighted = suppliers.reduce((sum, s) => sum + s.cost * s.quantity, 0);
  return round2(weighted / totalQty);
}

/** Absolute margin (R$) of a price over the base cost. */
export function tableMargin(baseCost: number, price: number): number {
  return round2(price - baseCost);
}

/**
 * Resolve the price tables to display: prefer stored `priceTables`, otherwise
 * derive from cost + margin. Returns [] when there is no cost to price from.
 */
export function resolvePriceTables(
  part: Pick<IPart, "priceTables" | "unitCost" | "marginPercent">,
): IPriceTable[] {
  if (part.priceTables && part.priceTables.length > 0) return part.priceTables;
  if (part.unitCost > 0) return buildPriceTables(part.unitCost, part.marginPercent);
  return [];
}
