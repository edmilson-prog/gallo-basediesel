import type { ID, ISO8601, Money } from "./common";

/**
 * Supplier — the counterpart of the customer on the money-out side (PRD do kit
 * `ui_kits/financeiro`). Purchase metrics do NOT live here: they are derived and
 * served by `ISupplierStats`, so the arrival of `payable` only adds fields.
 */

export type SupplierCategory = "parts" | "services" | "freight" | "financial";
export type SupplierStatus = "active" | "inactive";
export type SupplierPaymentMethod = "boleto" | "pix" | "transferencia" | "debito_automatico";

/** Where the record came from — a backfilled name has no CNPJ yet. */
export type SupplierSource = "manual" | "catalog_backfill";

export interface ISupplier {
  id: ID;
  storeId: ID;
  /** Razão social — what the Receita lookup returns. */
  name: string;
  /** Nome fantasia, when it differs from the razão social. */
  tradeName?: string;
  /** CNPJ, digits only. Absent on records backfilled from the catalog. */
  document?: string;
  category: SupplierCategory;
  /** Free text with a suggested vocabulary: "à vista", "28 dias", "30/60/90". */
  paymentTerms?: string;
  leadTimeDays?: number;
  contactName?: string;
  contactPhone?: string;
  preferredPaymentMethod?: SupplierPaymentMethod;
  /** What we buy from them — free text, filled in the form. */
  suppliedItems: string[];
  status: SupplierStatus;
  /** Snapshot of the Receita lookup, so the drawer doesn't re-query. */
  registryStatus?: string;
  registryActivity?: string;
  city?: string;
  state?: string;
  source: SupplierSource;
  notes?: string;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

/** One stock-entry line, read from `parts.suppliers` (jsonb). */
export interface ISupplierEntry {
  invoiceNumber?: string;
  invoiceDate?: ISO8601;
  cost: Money;
  quantity: number;
  /** The part the entry belongs to — lets the drawer link back to the catalog. */
  partId: ID;
  partName: string;
}

/**
 * Derived metrics. Everything here is computed on read, never stored.
 * `openAmount` / `nextDueDate` / `onTimeDeliveryRate` are deliberately ABSENT:
 * they need the `payable` entity, which does not exist yet.
 */
export interface ISupplierStats {
  supplierId: ID;
  /** Parts whose `supplier` text matches this record's normalized name. */
  linkedParts: number;
  purchasesLast12Months: Money;
  /** Most recent entries first, capped by the provider at 8. */
  lastEntries: ISupplierEntry[];
  /** 12 positions, oldest → newest, for the drawer chart. */
  monthlyPurchases: Money[];
}
