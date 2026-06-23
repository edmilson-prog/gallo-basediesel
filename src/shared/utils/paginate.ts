/** Defensive backstop: stop a `fetchPage` that never returns a short page from
 *  looping forever (10000 pages × a 1000-row page = 10M rows — far beyond any
 *  real analytics read). */
const MAX_PAGES = 10_000;

/**
 * Drains a paginated read into a flat array by calling `fetchPage(offset, limit)`
 * repeatedly until a page returns fewer than `pageSize` rows (a short page = the
 * source is exhausted). Pure and transport-agnostic — it knows nothing about any
 * backend; the caller supplies `fetchPage`.
 *
 * @throws {Error} if `pageSize` is not a positive integer.
 * @throws {Error} if the iteration cap is exceeded (a `fetchPage` that never
 *   returns a short page).
 */
export async function drainPaged<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize: number,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("drainPaged: pageSize must be a positive integer");
  }
  const out: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await fetchPage(page * pageSize, pageSize);
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
  throw new Error(`drainPaged: exceeded ${MAX_PAGES} pages — fetchPage never returned a short page`);
}
