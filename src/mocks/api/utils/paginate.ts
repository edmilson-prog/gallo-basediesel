/**
 * Generic pagination contract returned by every `list` operation in the mock
 * API. Mirrors the shape a Supabase response can be normalized into: data,
 * total count, current page and page size.
 */
export interface IPaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface IPaginationParams {
  page?: number;
  pageSize?: number;
}

/** Default page (1) and pageSize (20). */
export function resolvePagination(params: IPaginationParams = {}): {
  page: number;
  pageSize: number;
} {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.max(1, Math.min(200, Math.floor(params.pageSize ?? 20)));
  return { page, pageSize };
}

/** Slice an already-sorted array into a paginated result. */
export function paginate<T>(items: T[], params: IPaginationParams = {}): IPaginatedResult<T> {
  const { page, pageSize } = resolvePagination(params);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return {
    data: items.slice(start, end),
    total: items.length,
    page,
    pageSize,
  };
}
