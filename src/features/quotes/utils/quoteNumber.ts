import type { ID, IQuote } from "@/shared/types";

/**
 * Build a human-readable, sequential quote number for the given store and
 * year (PRD-031 RF-002). Sequence is `existingQuotes.length + 1` scoped to
 * the same store and creation year — good enough for the mock layer.
 */
export function generateQuoteNumber(
  existing: IQuote[],
  storeId: ID,
  now: Date = new Date(),
): string {
  const year = now.getUTCFullYear();
  const seq =
    existing.filter((q) => q.storeId === storeId && q.number.includes(`-${year}-`)).length + 1;
  return `OR-${year}-${String(seq).padStart(4, "0")}`;
}

/**
 * Derive the legacy combined `paymentCondition` field from the structured
 * method/terms pair (PRD-031 keeps both writable to stay backwards compatible
 * with PRD-022).
 */
export function composePaymentCondition(method?: string, terms?: string): string {
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
