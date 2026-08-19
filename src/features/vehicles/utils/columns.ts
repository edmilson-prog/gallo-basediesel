/**
 * Configurable columns for the vehicles list table.
 *
 * Mandatory column (always visible): vehicle (Veículo) — the row identifier,
 * which folds year and engine into its subtitle so they no longer need columns
 * of their own.
 *
 * `ficha` and `uso` replace the four columns that read `—` on almost every
 * imported row (Ano, Motor, Km atual, Última manutenção): `ficha` states what
 * the cadastro is missing, `uso` merges odometer and last service into one cell
 * that collapses to a single "sem registros" when both are blank.
 *
 * Toggleable columns are persisted in `localStorage` under
 * `gallo-vehicles-columns-v2` — the `-v2` suffix retires the previous column
 * ids so an existing preference cannot hide the two new columns.
 */

import { VEHICLE_STRINGS } from "../i18n/pt-BR";

export const MANDATORY_COLUMNS = ["vehicle"] as const;

export const OPTIONAL_COLUMNS = [
  "plate",
  "customer",
  "ficha",
  "usage",
  "seller",
  "cadastroStatus",
] as const;

export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];
export type ColumnId = (typeof MANDATORY_COLUMNS)[number] | OptionalColumn;

const COPY = VEHICLE_STRINGS.list.columns;

export const COLUMN_LABELS: Record<ColumnId, string> = {
  vehicle: COPY.vehicle,
  plate: COPY.plate,
  customer: COPY.customer,
  ficha: COPY.ficha,
  usage: COPY.usage,
  seller: COPY.seller,
  cadastroStatus: COPY.cadastroStatus,
};

export const DEFAULT_VISIBLE_OPTIONAL: OptionalColumn[] = [...OPTIONAL_COLUMNS];

export const COLUMNS_LOCALSTORAGE_KEY = "gallo-vehicles-columns-v2";

/** Default column widths in pixels (resizable columns persist overrides). */
export const DEFAULT_COLUMN_WIDTHS: Record<ColumnId, number> = {
  vehicle: 280,
  plate: 110,
  customer: 220,
  ficha: 180,
  usage: 180,
  seller: 150,
  cadastroStatus: 100,
};

/** Smallest width a column can be dragged to. */
export const MIN_COLUMN_WIDTH = 64;

export const COLUMN_WIDTHS_LOCALSTORAGE_KEY = "gallo-vehicles-column-widths-v2";

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
