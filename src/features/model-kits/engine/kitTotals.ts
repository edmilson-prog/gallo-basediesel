/**
 * Money and stock arithmetic for a kit's composition. Pure — the ficha, the card
 * and the apply preview all read the same numbers from here.
 */

export interface IKitTotalsPart {
  unitPrice: number;
  stockAvailable: number;
  stockMinimum: number;
}

export interface IKitTotalsLine {
  part: IKitTotalsPart;
  defaultQuantity: number;
  isOptional: boolean;
}

export interface IKitTotals {
  /** Sum of the base parts — what the kit costs as curated. */
  base: number;
  /** Sum of the optional suggestions. */
  optional: number;
  total: number;
  count: number;
  baseCount: number;
  optionalCount: number;
  /** Lines whose part has no stock. Never blocks applying — the quote warns again. */
  outOfStockCount: number;
}

export type StockTone = "ok" | "low" | "out";

export interface IStockState {
  tone: StockTone;
  label: string;
}

/** Stock reading for a catalog part, in the balcony's words. */
export function getStockState(
  part: Pick<IKitTotalsPart, "stockAvailable" | "stockMinimum">,
): IStockState {
  if (part.stockAvailable <= 0) return { tone: "out", label: "sem estoque" };
  if (part.stockAvailable <= part.stockMinimum) {
    return { tone: "low", label: `${part.stockAvailable} (baixo)` };
  }
  return { tone: "ok", label: `${part.stockAvailable} em estoque` };
}

export function computeKitTotals(lines: readonly IKitTotalsLine[]): IKitTotals {
  let base = 0;
  let optional = 0;
  let baseCount = 0;
  let optionalCount = 0;
  let outOfStockCount = 0;

  for (const line of lines) {
    const value = line.part.unitPrice * line.defaultQuantity;
    if (line.isOptional) {
      optional += value;
      optionalCount += 1;
    } else {
      base += value;
      baseCount += 1;
    }
    if (line.part.stockAvailable <= 0) outOfStockCount += 1;
  }

  return {
    base,
    optional,
    total: base + optional,
    count: lines.length,
    baseCount,
    optionalCount,
    outOfStockCount,
  };
}
