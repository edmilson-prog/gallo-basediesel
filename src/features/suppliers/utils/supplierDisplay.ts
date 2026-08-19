import type { SupplierPaymentMethod } from "@/shared/types";
import { SUPPLIERS_STRINGS } from "../i18n/pt-BR";

/**
 * `ISupplier["category"]` is free text on the converged type (the Tally
 * migration wouldn't add a check constraint that could break an existing
 * `category: null` row) — see `docs/superpowers/specs/2026-08-18-convergencia-fornecedor-design.md`.
 * These four are the only categories the UI offers as filter chips; anything
 * else — including `undefined` — narrows to `"parts"` for DISPLAY purposes
 * only. This never writes back to the record, it only decides which label
 * and badge a table row or the rail show.
 */
export type KnownSupplierCategory = "parts" | "services" | "freight" | "financial";

const KNOWN_CATEGORIES = new Set<KnownSupplierCategory>([
  "parts",
  "services",
  "freight",
  "financial",
]);

export function asKnownCategory(category: string | undefined): KnownSupplierCategory {
  if (category && KNOWN_CATEGORIES.has(category as KnownSupplierCategory)) {
    return category as KnownSupplierCategory;
  }
  return "parts";
}

/** Shared between `SuppliersTable` and `SupplierRail` — keep both in sync here. */
export const CATEGORY_LABEL: Record<KnownSupplierCategory, string> = {
  parts: SUPPLIERS_STRINGS.categories.parts,
  services: SUPPLIERS_STRINGS.categories.services,
  freight: SUPPLIERS_STRINGS.categories.freight,
  financial: SUPPLIERS_STRINGS.categories.financial,
};

/** Used by `SupplierFormDialog`'s "Forma preferida" select. */
export const PAYMENT_METHOD_LABEL: Record<SupplierPaymentMethod, string> = {
  boleto: SUPPLIERS_STRINGS.form.paymentMethods.boleto,
  pix: SUPPLIERS_STRINGS.form.paymentMethods.pix,
  transferencia: SUPPLIERS_STRINGS.form.paymentMethods.transferencia,
  debito_automatico: SUPPLIERS_STRINGS.form.paymentMethods.debito_automatico,
};

/** First letter of up to the first two words of the name, uppercased. */
export function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();
}
