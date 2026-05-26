import type { ID, IOrder } from "@/shared/types";

/**
 * Build a human-readable, sequential order number for the given store/year
 * (PRD-032 RF-003). Sequence is `existingOrders.length + 1` scoped to the
 * same store and creation year — good enough for the mock layer.
 *
 * Format: `PD-YYYY-####`
 */
export function generateOrderNumber(
  existing: IOrder[],
  storeId: ID,
  now: Date = new Date(),
): string {
  const year = now.getUTCFullYear();
  const tag = `-${year}-`;
  const seq =
    existing.filter((o) => o.storeId === storeId && o.number?.includes(tag)).length + 1;
  return `PD-${year}-${String(seq).padStart(4, "0")}`;
}

/**
 * Derive the legacy combined `paymentCondition` field from the structured
 * method/terms pair — mirrors the helper used by quotes (PRD-031).
 */
export function composeOrderPaymentCondition(method?: string, terms?: string): string {
  const m = (method ?? "").trim();
  const t = (terms ?? "").trim();
  if (m && t) return `${labelForMethod(m)} — ${t}`;
  if (m) return labelForMethod(m);
  if (t) return t;
  return "à combinar";
}

function labelForMethod(method: string): string {
  switch (method) {
    case "pix":
      return "PIX";
    case "boleto":
      return "Boleto";
    case "cartao":
      return "Cartão";
    case "prazo":
      return "Prazo";
    case "outro":
      return "Outro";
    default:
      return method;
  }
}
