/**
 * Configurable columns for the vehicles list table.
 *
 * Mandatory column (always visible): brand (Marca / Modelo) — the row identifier.
 * Toggleable columns are persisted in `localStorage` under `gallo-vehicles-columns`.
 */

import { VEHICLE_STRINGS } from "../i18n/pt-BR";

export const MANDATORY_COLUMNS = ["brand"] as const;

export const OPTIONAL_COLUMNS = [
  "year",
  "engine",
  "plate",
  "customer",
  "seller",
  "km",
  "lastService",
  "cadastroStatus",
] as const;

export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];
export type ColumnId = (typeof MANDATORY_COLUMNS)[number] | OptionalColumn;

const COPY = VEHICLE_STRINGS.list.columns;

export const COLUMN_LABELS: Record<ColumnId, string> = {
  brand: COPY.brand,
  year: COPY.year,
  engine: COPY.engine,
  plate: COPY.plate,
  customer: COPY.customer,
  seller: COPY.seller,
  km: COPY.km,
  lastService: COPY.lastService,
  cadastroStatus: COPY.cadastroStatus,
};

export const DEFAULT_VISIBLE_OPTIONAL: OptionalColumn[] = [...OPTIONAL_COLUMNS];

export const COLUMNS_LOCALSTORAGE_KEY = "gallo-vehicles-columns";

/** Default column widths in pixels (resizable columns persist overrides). */
export const DEFAULT_COLUMN_WIDTHS: Record<ColumnId, number> = {
  brand: 260,
  year: 80,
  engine: 150,
  plate: 120,
  customer: 200,
  seller: 160,
  km: 120,
  lastService: 150,
  cadastroStatus: 120,
};

/** Smallest width a column can be dragged to. */
export const MIN_COLUMN_WIDTH = 64;

export const COLUMN_WIDTHS_LOCALSTORAGE_KEY = "gallo-vehicles-column-widths";

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
