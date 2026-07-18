import type { IPart, IPartSupplier } from "@/shared/types";
import { formatBRL } from "@/shared/utils/format";

/** Latest supplier entry by invoice date; entries without a date sort last. */
export function latestSupplier(suppliers: IPartSupplier[] | undefined): IPartSupplier | null {
  if (!suppliers || suppliers.length === 0) return null;
  const sorted = [...suppliers].sort((a, b) => {
    const ta = a.invoiceDate ? new Date(a.invoiceDate).getTime() : 0;
    const tb = b.invoiceDate ? new Date(b.invoiceDate).getTime() : 0;
    return tb - ta;
  });
  return sorted[0] ?? null;
}

/**
 * Suggested purchase quantity: restock to twice the configured minimum, so the
 * part lands comfortably above the alert threshold (the model has no maximum).
 */
export function suggestedRestockQuantity(stockAvailable: number, stockMinimum: number): number {
  return Math.max(stockMinimum * 2 - stockAvailable, 1);
}

/**
 * Plain-text restock summary for the "Gerar pedido de compra" action — copied
 * to the clipboard so the buyer can paste it into the supplier order/WhatsApp.
 */
export function buildRestockSummary(part: IPart): string {
  const supplier = latestSupplier(part.suppliers);
  const cost = supplier?.cost ?? part.averageCost ?? part.unitCost;
  const lines = [
    `Pedido de compra — ${part.name}`,
    `SKU ${part.sku}${part.reference ? ` · Ref. ${part.reference}` : ""}`,
    `Estoque atual: ${part.stockAvailable} · Mínimo: ${part.stockMinimum}`,
    `Quantidade sugerida: ${suggestedRestockQuantity(part.stockAvailable, part.stockMinimum)} un (2× o mínimo)`,
  ];
  if (supplier) {
    const invoice = supplier.invoiceNumber ? ` · NF ${supplier.invoiceNumber}` : "";
    lines.push(`Último fornecedor: ${supplier.name}${invoice} · ${formatBRL(cost)}/un`);
  }
  return lines.join("\n");
}
