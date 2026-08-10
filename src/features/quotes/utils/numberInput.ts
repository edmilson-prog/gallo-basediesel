// src/features/quotes/utils/numberInput.ts

const decimalFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a number for an editable cell — pt-BR, always two decimals, no symbol. */
export function formatDecimalBR(value: number): string {
  return decimalFormatter.format(Number.isFinite(value) ? value : 0);
}

/**
 * Parse what a seller typed into an editable cell. Accepts pt-BR ("1.289,90"),
 * plain decimals ("1289.90") and loose input ("R$ 1.289,90"). Negative and
 * unparseable values collapse to 0 — a quote never carries a negative price.
 */
export function parseDecimalBR(raw: string): number {
  const cleaned = String(raw).replace(/[^\d.,-]/g, "");
  if (!cleaned) return 0;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) {
    // pt-BR: dots group thousands, the comma is the decimal separator.
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, "");
  } else {
    normalized = cleaned;
  }
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100) / 100;
}
