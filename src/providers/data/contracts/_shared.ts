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

export interface IPaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
