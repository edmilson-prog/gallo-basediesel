/**
 * Catalog search helpers — pure functions over an `IPart[]` slice.
 *
 * Consumed by:
 *  - PRD-021 (part identification) — replaces the placeholder stub
 *  - PRD-016 (vehicle detail) — compatible-parts tab
 *  - PRD-030 listing page (textual + applications search)
 */
import type { ID, IPart, PartCategory } from "@/shared/types";

export interface IApplicationSearchInput {
  brand?: string;
  model?: string;
  year?: number;
  engine?: string;
  category?: PartCategory;
  subcategory?: string;
  oemCode?: string;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Find a part by exact OEM code (case-insensitive). */
export function findByOemCode(parts: IPart[], code: string): IPart | undefined {
  if (!code) return undefined;
  const needle = normalize(code);
  return parts.find((p) => p.oemCodes.some((c) => normalize(c) === needle));
}

/** Find every part that lists `code` among its alternative (non-primary) OEM codes. */
export function findByAlternativeCode(parts: IPart[], code: string): IPart[] {
  if (!code) return [];
  const needle = normalize(code);
  return parts.filter((p) => p.oemCodes.slice(1).some((c) => normalize(c).includes(needle)));
}

/** Resolve every part listed in `equivalentPartIds` of the given part. */
export function getEquivalents(parts: IPart[], partId: ID): IPart[] {
  const source = parts.find((p) => p.id === partId);
  if (!source) return [];
  const byId = new Map(parts.map((p) => [p.id, p] as const));
  return source.equivalentPartIds.map((id) => byId.get(id)).filter((p): p is IPart => Boolean(p));
}

/**
 * Search the catalog by vehicle attributes and (optionally) part taxonomy.
 *
 * Behaviour:
 *  - When `oemCode` is provided and matches, returns that single part.
 *  - Otherwise filters parts whose `applications[]` contain at least one
 *    entry matching the brand/model/year/engine combination.
 *  - Category/subcategory tighten the filter, never broaden it.
 */
export function searchPartsByApplication(parts: IPart[], input: IApplicationSearchInput): IPart[] {
  if (input.oemCode) {
    const direct = findByOemCode(parts, input.oemCode);
    return direct ? [direct] : [];
  }

  const brand = input.brand ? normalize(input.brand) : undefined;
  const model = input.model ? normalize(input.model) : undefined;
  const engine = input.engine ? normalize(input.engine) : undefined;

  return parts.filter((part) => {
    if (input.category && part.category !== input.category) return false;
    if (input.subcategory && part.subcategory !== input.subcategory) return false;

    return part.applications.some((app) => {
      if (brand && normalize(app.vehicleBrand) !== brand) return false;
      if (model && normalize(app.vehicleModel) !== model) return false;
      if (input.year !== undefined) {
        if (input.year < app.yearStart || input.year > app.yearEnd) return false;
      }
      if (engine && (!app.engine || normalize(app.engine) !== engine)) return false;
      return true;
    });
  });
}

/** Full-text search across name, OEM codes, description and SKU. */
export function searchPartsByText(parts: IPart[], query: string): IPart[] {
  const q = normalize(query);
  if (!q) return parts;
  return parts.filter((p) => {
    if (normalize(p.name).includes(q)) return true;
    if (normalize(p.sku).includes(q)) return true;
    if (p.description && normalize(p.description).includes(q)) return true;
    return p.oemCodes.some((code) => normalize(code).includes(q));
  });
}
