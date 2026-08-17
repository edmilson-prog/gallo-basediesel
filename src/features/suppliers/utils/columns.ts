import { SUPPLIERS_STRINGS } from "../i18n/pt-BR";

/**
 * `supplier` is always visible — it is the row's identity. The rest can be
 * hidden from the header's right-click menu.
 *
 * The kit's `Em aberto`, `Vence` and `No prazo` columns are deliberately absent:
 * they need the `payable` entity. When it lands, add the ids here and the menu
 * picks them up with no other change.
 */
export type SupplierColumnId =
  | "supplier"
  | "terms"
  | "parts"
  | "purchases"
  | "completeness"
  | "contact";

export const OPTIONAL_COLUMNS = ["terms", "parts", "purchases", "completeness", "contact"] as const;

export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];

export const COLUMN_LABELS: Record<SupplierColumnId, string> = {
  supplier: SUPPLIERS_STRINGS.columns.supplier,
  terms: SUPPLIERS_STRINGS.columns.terms,
  parts: SUPPLIERS_STRINGS.columns.parts,
  purchases: SUPPLIERS_STRINGS.columns.purchases,
  completeness: SUPPLIERS_STRINGS.columns.completeness,
  contact: SUPPLIERS_STRINGS.columns.contact,
};

export const DEFAULT_COLUMN_WIDTHS: Record<SupplierColumnId, number> = {
  supplier: 300,
  terms: 110,
  parts: 90,
  purchases: 130,
  completeness: 170,
  contact: 180,
};

const STORAGE_KEY = "gallo-suppliers-visible-columns";
/** Column widths use their own key, read by `useResizableColumns`. */
export const WIDTHS_STORAGE_KEY = "gallo-suppliers-column-widths";

export function readVisibleOptional(): OptionalColumn[] {
  if (typeof window === "undefined") return [...OPTIONAL_COLUMNS];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...OPTIONAL_COLUMNS];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...OPTIONAL_COLUMNS];
    return OPTIONAL_COLUMNS.filter((id) => parsed.includes(id));
  } catch {
    return [...OPTIONAL_COLUMNS];
  }
}

export function writeVisibleOptional(ids: readonly OptionalColumn[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Private mode / quota — visibility is a preference, never a blocker.
  }
}
