/**
 * CSV export for the catalog list's bulk-selection bar.
 *
 * Targets Excel pt-BR: `;` separator, CRLF rows and a UTF-8 BOM, so accented
 * part names survive a double-click open on Windows.
 */

import type { IPart } from "@/shared/types";
import { getCategoryLabel } from "./categories";
import { missingFields, MISSING_FIELD_LABELS } from "./completeness";
import { marginOnPrice } from "./pricing";

export const CSV_SEPARATOR = ";";
const ROW_SEPARATOR = "\r\n";
const BOM = "﻿";

export const CATALOG_CSV_HEADERS = [
  "SKU",
  "Nome",
  "Categoria",
  "Subcategoria",
  "Fabricante",
  "Original",
  "OEM",
  "Referências cruzadas",
  "Aplicações",
  "Preço",
  "Custo",
  "Margem %",
  "Estoque",
  "Mínimo",
  "Status",
  "Pendências",
] as const;

/**
 * Quote a CSV field. Excel only needs quoting for the separator, quotes and
 * line breaks — but a leading `=`, `+`, `-` or `@` turns the cell into a
 * formula, so those get a leading apostrophe (CSV injection).
 */
export function escapeCsvValue(value: string): string {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[";\r\n]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}

function decimal(value: number, fractionDigits = 2): string {
  return value.toFixed(fractionDigits).replace(".", ",");
}

function partRow(part: IPart): string[] {
  const pending = missingFields(part).map((field) => MISSING_FIELD_LABELS[field]);
  return [
    part.sku,
    part.name,
    part.category ? getCategoryLabel(part.category) : "",
    part.subcategory ?? "",
    part.brand,
    part.isOriginal ? "Sim" : "Não",
    part.oemCodes.join(" | "),
    (part.crossReferences ?? []).map((ref) => `${ref.brand} ${ref.code}`.trim()).join(" | "),
    part.applications.map((app) => `${app.vehicleBrand} ${app.vehicleModel}`).join(" | "),
    decimal(part.unitPrice),
    part.unitCost > 0 ? decimal(part.unitCost) : "",
    part.unitCost > 0 ? decimal(marginOnPrice(part.unitPrice, part.unitCost) * 100, 1) : "",
    String(part.stockAvailable),
    String(part.stockMinimum),
    part.active ? "Ativo" : "Inativo",
    pending.join(" | "),
  ];
}

/** Build the CSV body (no BOM) — the header row plus one row per part. */
export function buildCatalogCsv(parts: IPart[]): string {
  const rows = [[...CATALOG_CSV_HEADERS], ...parts.map(partRow)];
  return rows.map((row) => row.map(escapeCsvValue).join(CSV_SEPARATOR)).join(ROW_SEPARATOR);
}

/** Filename stamped with the export date, e.g. `catalogo-2026-08-14.csv`. */
export function catalogCsvFilename(now: Date): string {
  return `catalogo-${now.toISOString().slice(0, 10)}.csv`;
}

/**
 * Trigger a client-side download of the given parts as CSV.
 * No-op outside the browser.
 */
export function downloadCatalogCsv(parts: IPart[], now: Date = new Date()): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([BOM + buildCatalogCsv(parts)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = catalogCsvFilename(now);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
