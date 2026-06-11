/**
 * Configurable columns for the orders list table (cockpit/console layouts).
 *
 * Mandatory column (always visible): number — the row identifier.
 * Toggleable columns are persisted in `localStorage` under `gallo-orders-columns`.
 */

export const MANDATORY_COLUMNS = ["number"] as const;

export const OPTIONAL_COLUMNS = [
  "customer",
  "origin",
  "seller",
  "total",
  "status",
  "createdAt",
] as const;

export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];
export type ColumnId = (typeof MANDATORY_COLUMNS)[number] | OptionalColumn;

export const COLUMN_LABELS: Record<ColumnId, string> = {
  number: "Número",
  customer: "Cliente",
  origin: "Origem",
  seller: "Vendedor",
  total: "Total",
  status: "Status",
  createdAt: "Data",
};

export const DEFAULT_VISIBLE_OPTIONAL: OptionalColumn[] = [...OPTIONAL_COLUMNS];

export const COLUMNS_LOCALSTORAGE_KEY = "gallo-orders-columns";

export function readVisibleOptional(): OptionalColumn[] {
  if (typeof window === "undefined") return DEFAULT_VISIBLE_OPTIONAL;
  try {
    const raw = window.localStorage.getItem(COLUMNS_LOCALSTORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_OPTIONAL;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE_OPTIONAL;
    return parsed.filter((id): id is OptionalColumn =>
      (OPTIONAL_COLUMNS as readonly string[]).includes(String(id)),
    );
  } catch {
    return DEFAULT_VISIBLE_OPTIONAL;
  }
}

export function writeVisibleOptional(ids: OptionalColumn[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLUMNS_LOCALSTORAGE_KEY, JSON.stringify(ids));
  } catch {
    // localStorage indisponível — preferência apenas em memória nesta sessão.
  }
}
