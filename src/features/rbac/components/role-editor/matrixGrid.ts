/**
 * Shared CSS grid template for the permission matrix (PRD-211).
 *
 * The header row (`PermissionMatrix`) and every resource row (`ResourceAreaGroup`)
 * MUST use the exact same column template so they can never silently drift out of
 * alignment. Columns: resource label | 5 action cells | scope selector.
 */
export const MATRIX_GRID_COLS = "grid-cols-[minmax(8rem,1fr)_repeat(5,3rem)_8rem]";
