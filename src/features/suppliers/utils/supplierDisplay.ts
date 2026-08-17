import type { ISupplier, SupplierPaymentMethod } from "@/shared/types";
import { SUPPLIERS_STRINGS } from "../i18n/pt-BR";

/** Shared between `SuppliersTable` and `SupplierRail` — keep both in sync here. */
export const CATEGORY_LABEL: Record<ISupplier["category"], string> = {
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
