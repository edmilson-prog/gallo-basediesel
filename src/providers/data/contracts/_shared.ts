/**
 * Cross-contract primitives. These shapes are part of the public provider
 * contract and must be honored by every implementation (mock + Supabase).
 *
 * Structurally identical to the pagination shape used internally by the mock
 * layer (`src/mocks/api/utils/paginate.ts`), but the contracts own their own
 * declaration — the providers layer does not depend on `@/mocks` types.
 */

export interface IPaginationParams {
  page?: number;
  pageSize?: number;
}

/**
 * pageSize for callers that genuinely need the COMPLETE filtered set (indexes,
 * aggregations, filter options, client-side-filtered boards) rather than a
 * page. Supabase providers fulfill any pageSize above 1000 by issuing multiple
 * sequential range chunks (`impl/supabase/_pagination.ts`), so this is a real
 * ceiling, not a hint — keep it above every plausible table size. Callers that
 * paginate, sample, or search server-side must NOT use this.
 */
export const FETCH_ALL_PAGE_SIZE = 10_000;

export interface IPaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
