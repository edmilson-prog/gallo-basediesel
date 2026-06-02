/**
 * Configurable columns for the catalog list table.
 *
 * The leading image column is fixed-width and always visible. The `name`
 * column is mandatory (the row identifier). Toggleable columns are persisted
 * in `localStorage` under `gallo-catalog-columns`; resizable widths under
 * `gallo-catalog-column-widths`.
 */

import { CATALOG_STRINGS } from "../i18n/pt-BR";

export const MANDATORY_COLUMNS = ["name"] as const;

export const OPTIONAL_COLUMNS = [
  "oem",
  "category",
  "manufacturer",
  "applications",
  "price",
  "stock",
  "status",
] as const;

export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];
export type ColumnId = (typeof MANDATORY_COLUMNS)[number] | OptionalColumn;

const COPY = CATALOG_STRINGS.columns;

export const COLUMN_LABELS: Record<ColumnId, string> = {
  name: COPY.name,
  oem: COPY.oem,
  category: COPY.category,
  manufacturer: COPY.manufacturer,
  applications: COPY.applications,
  price: COPY.price,
  stock: COPY.stock,
  status: COPY.status,
};

export const DEFAULT_VISIBLE_OPTIONAL: OptionalColumn[] = [...OPTIONAL_COLUMNS];

export const COLUMNS_LOCALSTORAGE_KEY = "gallo-catalog-columns";

/** Default column widths in pixels (resizable columns persist overrides). */
export const DEFAULT_COLUMN_WIDTHS: Record<ColumnId, number> = {
  name: 280,
  oem: 140,
  category: 160,
  manufacturer: 170,
  applications: 220,
  price: 120,
  stock: 120,
  status: 120,
};

/** Smallest width a column can be dragged to. */
export const MIN_COLUMN_WIDTH = 64;

export const COLUMN_WIDTHS_LOCALSTORAGE_KEY = "gallo-catalog-column-widths";

const ALL_COLUMN_IDS = [...MANDATORY_COLUMNS, ...OPTIONAL_COLUMNS] as readonly ColumnId[];

export function readColumnWidths(): Record<ColumnId, number> {
  if (typeof window === "undefined") return { ...DEFAULT_COLUMN_WIDTHS };
  try {
    const raw = window.localStorage.getItem(COLUMN_WIDTHS_LOCALSTORAGE_KEY);
    if (!raw) return { ...DEFAULT_COLUMN_WIDTHS };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_COLUMN_WIDTHS };
    const result = { ...DEFAULT_COLUMN_WIDTHS };
    for (const id of ALL_COLUMN_IDS) {
      const value = (parsed as Record<string, unknown>)[id];
      if (typeof value === "number" && Number.isFinite(value)) {
        result[id] = Math.max(MIN_COLUMN_WIDTH, value);
      }
    }
    return result;
  } catch {
    return { ...DEFAULT_COLUMN_WIDTHS };
  }
}

export function writeColumnWidths(widths: Record<ColumnId, number>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLUMN_WIDTHS_LOCALSTORAGE_KEY, JSON.stringify(widths));
  } catch {
    // localStorage indisponível — larguras apenas em memória nesta sessão.
  }
}

export function readVisibleOptional(): OptionalColumn[] {
  if (typeof window === "undefined") return DEFAULT_VISIBLE_OPTIONAL;
  try {
    const raw = window.localStorage.getItem(COLUMNS_LOCALSTORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_OPTIONAL;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE_OPTIONAL;
    const valid = parsed.filter((id): id is OptionalColumn =>
      (OPTIONAL_COLUMNS as readonly string[]).includes(String(id)),
    );
    return valid;
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
