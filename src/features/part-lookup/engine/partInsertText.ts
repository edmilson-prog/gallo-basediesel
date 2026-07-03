import type { IPart } from "@/shared/types";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Price text — never "R$ 0,00"; missing/zero price degrades to a consult label. */
export function priceText(part: Pick<IPart, "unitPrice">): string {
  // Guard also covers negative values (treated as unpriced, never rendered).
  if (part.unitPrice <= 0) return "Sob consulta";
  // Intl.NumberFormat pt-BR inserts a non-breaking space (U+00A0); normalize it.
  return BRL.format(part.unitPrice).replace(/\u00A0/g, " ");
}

/** Stock phrase used in the inserted text. */
function stockPhrase(part: Pick<IPart, "stockAvailable">): string {
  return part.stockAvailable > 0 ? `${part.stockAvailable} un` : "sob consulta";
}

/**
 * Build the "T1 · Completo" WhatsApp text for a part: bold name (*..*), code +
 * manufacturer reference, price and stock. NEVER includes cost or margin.
 */
export function buildPartInsertText(part: IPart): string {
  const refLine = [`Código: ${part.sku}`];
  if (part.reference) refLine.push(`Ref.: ${part.reference}`);
  return [
    `*${part.name}*`,
    refLine.join(" · "),
    `Valor: ${priceText(part)} · Disp.: ${stockPhrase(part)}`,
  ].join("\n");
}

/** Append text to a draft, preserving any existing content (blank line between). */
export function appendToDraft(prev: string, text: string): string {
  const trimmed = prev.replace(/\s+$/, "");
  return trimmed.length === 0 ? text : `${trimmed}\n\n${text}`;
}
