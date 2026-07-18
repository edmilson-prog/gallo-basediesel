import type { IPartCrossReference } from "@/shared/types";

/**
 * Reads one competitor-brand cross-reference per column, starting at
 * `start` — the layout both supplier spreadsheets use (a fixed run of
 * brand-named columns, one code per cell, `-`/blank meaning "not offered by
 * that brand"). `brands[i]` names the column at `row[start + i]`.
 */
export function extractCrossReferences(row: string[], brands: string[], start: number): IPartCrossReference[] {
  const out: IPartCrossReference[] = [];
  for (let i = 0; i < brands.length; i++) {
    const cell = (row[start + i] ?? "").trim();
    if (cell && cell !== "-") out.push({ brand: brands[i], code: cell });
  }
  return out;
}
