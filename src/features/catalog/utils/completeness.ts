/**
 * Catalog record completeness — the "enrichment queue" model from the catalog
 * list design kit.
 *
 * The DINTEC import left most of the catalog half-filled: names without a
 * category, parts without a manufacturer, no OEM, no application, no cost. The
 * list is therefore not just a browser but a worklist, and these rules decide
 * what still has to be filled in before a part can actually be sold.
 */

import type { IPart } from "@/shared/types";

/** A field the commercial team still has to fill in. */
export type PartMissingField = "category" | "manufacturer" | "oem" | "application" | "cost";

export const MISSING_FIELD_LABELS: Record<PartMissingField, string> = {
  category: "Categoria",
  manufacturer: "Fabricante",
  oem: "OEM",
  application: "Aplicação",
  cost: "Custo",
};

/** Canonical order the chips are rendered in. */
export const MISSING_FIELD_ORDER: readonly PartMissingField[] = [
  "category",
  "manufacturer",
  "oem",
  "application",
  "cost",
] as const;

/** A cost of 0 means "never filled in", not "free" — nothing in the catalog is free. */
export function hasCost(part: Pick<IPart, "unitCost">): boolean {
  return part.unitCost > 0;
}

function hasManufacturer(part: Pick<IPart, "brand">): boolean {
  return part.brand.trim().length > 0;
}

/** Fields still missing from a part's record, in canonical order. */
export function missingFields(part: IPart): PartMissingField[] {
  const missing: PartMissingField[] = [];
  if (!part.category) missing.push("category");
  if (!hasManufacturer(part)) missing.push("manufacturer");
  if (part.oemCodes.length === 0) missing.push("oem");
  if (part.applications.length === 0) missing.push("application");
  if (!hasCost(part)) missing.push("cost");
  return missing;
}

/**
 * Ready to sell: category + manufacturer + cost, plus at least one way for a
 * salesperson to find it (an OEM code or a vehicle application). A part can be
 * missing one of OEM/application and still be sellable — missing both makes it
 * unfindable at the counter.
 */
export function isReadyToSell(part: IPart): boolean {
  return (
    Boolean(part.category) &&
    hasManufacturer(part) &&
    hasCost(part) &&
    (part.oemCodes.length > 0 || part.applications.length > 0)
  );
}

/**
 * Zeroed stock on a part that declares a minimum — the buyer should reorder.
 * A zeroed part with no minimum is not a restock signal: nobody ever said how
 * many of it the shelf should hold.
 */
export function needsRestock(part: IPart): boolean {
  return part.active && part.stockAvailable <= 0 && part.stockMinimum > 0;
}

/**
 * Deactivation candidate: active, never sold, zeroed, and its record is nearly
 * empty. Requires real turnover data — when turnover is unknown (`null`) this
 * is always false, so the suggestion never fires on missing data.
 */
export function isDeadStockCandidate(part: IPart, turnover: number | null): boolean {
  return (
    part.active && turnover === 0 && part.stockAvailable <= 0 && missingFields(part).length >= 4
  );
}

/* ── Coverage buckets ────────────────────────────────────────────────────── */

/** The completeness strip's filters — each one is a slice of the whole base. */
export type CoverageBucket =
  | "all"
  | "ready"
  | "noCategory"
  | "noOem"
  | "noApplication"
  | "noCost"
  | "restock";

/** Semantic tone driving the bucket's count colour. */
export type CoverageTone = "neutral" | "success" | "critical" | "warning";

export interface ICoverageBucketDescriptor {
  id: CoverageBucket;
  label: string;
  tone: CoverageTone;
  /** Absent on `all` — that bucket matches everything. */
  test?: (part: IPart) => boolean;
}

export const COVERAGE_BUCKETS: readonly ICoverageBucketDescriptor[] = [
  { id: "all", label: "Todas", tone: "neutral" },
  { id: "ready", label: "Prontas para venda", tone: "success", test: isReadyToSell },
  {
    id: "noCategory",
    label: "Sem categoria",
    tone: "critical",
    test: (part) => !part.category,
  },
  { id: "noOem", label: "Sem OEM", tone: "neutral", test: (part) => part.oemCodes.length === 0 },
  {
    id: "noApplication",
    label: "Sem aplicação",
    tone: "neutral",
    test: (part) => part.applications.length === 0,
  },
  { id: "noCost", label: "Sem custo", tone: "neutral", test: (part) => !hasCost(part) },
  { id: "restock", label: "Repor", tone: "warning", test: needsRestock },
] as const;

const BUCKET_BY_ID = new Map<CoverageBucket, ICoverageBucketDescriptor>(
  COVERAGE_BUCKETS.map((bucket) => [bucket.id, bucket]),
);

export const DEFAULT_COVERAGE: CoverageBucket = "all";

export function isCoverageBucket(value: unknown): value is CoverageBucket {
  return typeof value === "string" && BUCKET_BY_ID.has(value as CoverageBucket);
}

/** Does a part belong to a bucket? Unknown buckets fall back to "everything". */
export function matchesCoverage(part: IPart, bucket: CoverageBucket): boolean {
  const descriptor = BUCKET_BY_ID.get(bucket);
  if (!descriptor?.test) return true;
  return descriptor.test(part);
}

/**
 * Count every bucket in a single pass over the catalog. Counts describe the
 * whole base, not the filtered page — the strip is a map of the work left.
 */
export function countCoverage(parts: IPart[]): Record<CoverageBucket, number> {
  const counts = {
    all: parts.length,
    ready: 0,
    noCategory: 0,
    noOem: 0,
    noApplication: 0,
    noCost: 0,
    restock: 0,
  } satisfies Record<CoverageBucket, number>;

  for (const part of parts) {
    if (isReadyToSell(part)) counts.ready += 1;
    if (!part.category) counts.noCategory += 1;
    if (part.oemCodes.length === 0) counts.noOem += 1;
    if (part.applications.length === 0) counts.noApplication += 1;
    if (!hasCost(part)) counts.noCost += 1;
    if (needsRestock(part)) counts.restock += 1;
  }

  return counts;
}
