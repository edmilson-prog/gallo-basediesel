/**
 * Hard per-request row ceiling PostgREST enforces (Supabase's `db-max-rows`).
 * Every `.range()` call must ask for at most this many rows; `fetchLargePage`
 * transparently issues multiple sequential requests to satisfy any larger
 * `pageSize`.
 */
const RANGE_CHUNK_SIZE = 1000;

export interface IRangeChunkResult<T> {
  data: T[];
  count: number;
}

/**
 * Fulfills a `pageSize` larger than PostgREST's per-request row ceiling by
 * issuing multiple sequential `.range()` queries and concatenating them.
 *
 * `fetchChunk` must build the fully-filtered, fully-ordered query fresh on
 * every call and apply `.range(from, to)` itself before awaiting — Supabase
 * query builders are not safely reusable across independent executions, so
 * each chunk needs its own freshly-built query (same idiom already used by
 * `scripts/dintec-import/run-parts-dintec-import.ts`'s idempotency anchor and
 * `managerDashboard.ts`'s `drainPages`).
 */
export async function fetchLargePage<T>(
  fetchChunk: (from: number, to: number) => Promise<IRangeChunkResult<T>>,
  from: number,
  pageSize: number,
): Promise<{ data: T[]; total: number }> {
  const data: T[] = [];
  let total = 0;
  let offset = from;
  const end = from + pageSize;
  while (offset < end) {
    const chunkTo = Math.min(offset + RANGE_CHUNK_SIZE, end) - 1;
    const chunk = await fetchChunk(offset, chunkTo);
    total = chunk.count;
    data.push(...chunk.data);
    if (chunk.data.length === 0 || offset + chunk.data.length >= total) break;
    offset += chunk.data.length;
  }
  return { data, total };
}
