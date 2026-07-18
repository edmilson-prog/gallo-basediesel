import type { IPartCrossReference } from "@/shared/types";

/**
 * Normalizes a competitor cross-reference code for cross-spreadsheet
 * matching — UFI and Turbo Filtros format the same physical part's code
 * differently (spacing, dashes, dots), so codes must collapse to a common
 * key before comparing brand-to-brand.
 */
export function normalizeCrossReferenceCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s\-./]/g, "");
}

export interface CrossReferenceSource {
  sku: string;
  crossReferences: IPartCrossReference[];
}

/**
 * Builds a `brand::normalizedCode -> sku` lookup from a set of
 * cross-referenced rows (e.g. the UFI sheet, scoped to skus that already
 * exist on the platform). First entry wins on a collision — deterministic,
 * source-order-stable.
 */
export function buildCrossReferenceIndex(entries: CrossReferenceSource[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const entry of entries) {
    for (const cr of entry.crossReferences) {
      const key = `${cr.brand}::${normalizeCrossReferenceCode(cr.code)}`;
      if (!index.has(key)) index.set(key, entry.sku);
    }
  }
  return index;
}

/**
 * Bridges a row that has no direct sku match (Turbo Filtros' own
 * "Referência Turbo" is a different numbering scheme than the platform sku
 * entirely — confirmed empirically, not a parsing bug) to an existing
 * platform sku via a shared competitor-brand cross-reference code: same
 * physical part, proven by a matching Mann/Donaldson/etc. code against the
 * index from `buildCrossReferenceIndex`. Returns the first match found, in
 * `crossReferences` order — deterministic.
 */
export function findBridgeSku(crossReferences: IPartCrossReference[], index: Map<string, string>): string | null {
  for (const cr of crossReferences) {
    const key = `${cr.brand}::${normalizeCrossReferenceCode(cr.code)}`;
    const sku = index.get(key);
    if (sku) return sku;
  }
  return null;
}
