import type { ID } from "@/shared/types";

/**
 * Group items by a string key derived from each item.
 * Empty / undefined keys are skipped.
 */
export function groupBy<T>(items: T[], keyFn: (item: T) => string | undefined): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    const bucket = out.get(key) ?? [];
    bucket.push(item);
    out.set(key, bucket);
  }
  return out;
}

/** Sum a numeric projection of items. */
export function sumBy<T>(items: T[], valueFn: (item: T) => number): number {
  let total = 0;
  for (const item of items) total += valueFn(item);
  return total;
}

/**
 * Percent change comparing current vs previous as decimal share.
 * Returns null when comparison is undefined (previous = 0 with current > 0).
 */
export function trendPct(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return 0;
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Compute item's share of the total (0..1). Defensive against zero totals. */
export function percentOfTotal(value: number, total: number): number {
  if (total <= 0) return 0;
  return value / total;
}

/** Take the first `n` items sorted by `scoreFn` descending. */
export function topN<T>(items: T[], n: number, scoreFn: (item: T) => number): T[] {
  return [...items].sort((a, b) => scoreFn(b) - scoreFn(a)).slice(0, n);
}

/**
 * Bucket items into year-month keys (`YYYY-MM`). Useful for monthly time series.
 * Items whose timestamp resolver returns undefined are skipped.
 */
export function bucketByMonth<T>(
  items: T[],
  timestampFn: (item: T) => string | undefined,
): Map<string, T[]> {
  return groupBy(items, (item) => {
    const ts = timestampFn(item);
    if (!ts) return undefined;
    return ts.slice(0, 7);
  });
}

/**
 * Build a contiguous 12-month axis ending at `endIso` (default: now). Returns
 * `YYYY-MM` keys ordered oldest → newest. Useful to fill empty months with 0.
 */
export function last12MonthKeys(endIso?: string): string[] {
  const end = endIso ? new Date(endIso) : new Date();
  const keys: string[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

/** Lookup a Map<ID, T> with a defensive fallback. */
export function pick<T>(map: Map<ID, T>, id: ID | undefined): T | undefined {
  if (!id) return undefined;
  return map.get(id);
}
