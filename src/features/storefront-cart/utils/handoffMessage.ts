import type { ICartItem } from "@/features/storefront/store/cartStore";
import { formatBRL } from "@/shared/utils/format";

export interface IHandoffContact {
  name?: string;
  phone?: string;
}

/**
 * Builds the plain-text order summary handed off to the store via WhatsApp (#42).
 *
 * Pure and deterministic so it can be unit-tested and reused for the "copiar
 * resumo" clipboard fallback. It performs no writes and has no side effects —
 * this is the write-free path the storefront uses in `supabase` mode, where the
 * visitor is anonymous and anon writes are blocked by RLS.
 */
export function buildHandoffMessage(
  items: ICartItem[],
  subtotal: number,
  contact: IHandoffContact = {},
  storeName = "GALLO PARTS",
): string {
  const lines: string[] = [`Olá! Gostaria de fazer um pedido na ${storeName}:`, ""];

  for (const item of items) {
    const code = item.partOemCode ?? item.partSku;
    const codeSuffix = code ? ` (cód. ${code})` : "";
    lines.push(
      `• ${item.quantity}× ${item.partName}${codeSuffix} — ${formatBRL(
        item.unitPrice * item.quantity,
      )}`,
    );
  }

  lines.push("", `Subtotal: ${formatBRL(subtotal)}`);

  const contactLines: string[] = [];
  if (contact.name?.trim()) contactLines.push(`Nome: ${contact.name.trim()}`);
  if (contact.phone?.trim()) contactLines.push(`WhatsApp: ${contact.phone.trim()}`);
  if (contactLines.length > 0) {
    lines.push("", "Meus dados:", ...contactLines);
  }

  return lines.join("\n");
}
