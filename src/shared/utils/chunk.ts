/**
 * Splits `items` into consecutive sub-arrays of at most `size` elements.
 *
 * Pure, dependency-free, and transport-agnostic — it knows nothing about any
 * caller or backend. (One use is keeping a large `.in(col, …)` filter under a
 * backend's request-line length limit, but that concern lives at the call site.)
 *
 * @throws {Error} if `size` is not a positive integer (rejects 0, negatives,
 *   non-integers, `NaN`, and `Infinity` so a bad size can't silently drop items).
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error("chunk: size must be a positive integer");
  }
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
