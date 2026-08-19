import type { ISupplier } from "@/shared/types";

/**
 * The list is an enrichment queue: the ~126 suppliers backfilled from the
 * catalog arrive with a name and nothing else. The `Cadastro` column shows what
 * is MISSING rather than an empty cell, and clicking it opens the form on that
 * field — same move the catalog list made for parts.
 */

export type SupplierMissingField = "paymentTerms" | "leadTimeDays" | "contact" | "suppliedItems";

/** Order matters: this is the order the form asks for them. */
const FIELDS: SupplierMissingField[] = ["paymentTerms", "leadTimeDays", "contact", "suppliedItems"];

export const SUPPLIER_MISSING_LABELS: Record<SupplierMissingField, string> = {
  paymentTerms: "sem condição",
  leadTimeDays: "sem prazo",
  contact: "sem contato",
  suppliedItems: "sem itens",
};

export interface ISupplierCompleteness {
  filled: number;
  total: number;
  /** 0–100, rounded. */
  percent: number;
  missing: SupplierMissingField[];
}

function isFilled(supplier: ISupplier, field: SupplierMissingField): boolean {
  switch (field) {
    case "paymentTerms":
      return Boolean(supplier.paymentTerms?.trim());
    case "leadTimeDays":
      // `typeof === "number"` alone distinguishes ABSENT (`undefined`, not
      // filled) from an explicit `0` (a legitimate lead time — same-day
      // delivery — that the migration's `>= 0` check allows and the rail
      // already renders as "0 dias" instead of hiding). A trailing `> 0`
      // would treat that explicit zero as missing again.
      return typeof supplier.leadTimeDays === "number";
    case "contact":
      // `||`, not `??`: a cleared contact name can be stored as `""`, which
      // must fall through to the phone like an absent name does — same
      // convention `SuppliersTable`'s `terms`/`contact` cells already use.
      return Boolean(supplier.contactName?.trim() || supplier.contactPhone?.trim());
    case "suppliedItems":
      return (supplier.suppliedItems?.length ?? 0) > 0;
  }
}

export function supplierCompleteness(supplier: ISupplier): ISupplierCompleteness {
  const missing = FIELDS.filter((field) => !isFilled(supplier, field));
  const filled = FIELDS.length - missing.length;
  return {
    filled,
    total: FIELDS.length,
    percent: Math.round((filled / FIELDS.length) * 100),
    missing,
  };
}
