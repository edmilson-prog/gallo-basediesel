/**
 * Splits `items` into consecutive sub-arrays of at most `size` elements.
 *
 * Pure and transport-agnostic. Used to keep Supabase/PostgREST `.in(col, …)`
 * filters under the request-line length limit when an id set is store-wide
 * (a single oversized `.in()` is rejected at the edge with 400 before RLS).
 *
 * @throws if `size <= 0`.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk: size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
