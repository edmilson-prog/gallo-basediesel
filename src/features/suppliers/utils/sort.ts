export type SupplierSortBy = "name" | "parts" | "purchases" | "completeness";

export interface ISuppliersSort {
  by: SupplierSortBy;
  dir: "asc" | "desc";
}

/**
 * Shared toggle logic for both sort affordances — the filters bar's
 * segmented control and the table's clickable headers (Task 6 fix round 1).
 * Clicking a new field starts it at `desc`; clicking the already-active field
 * flips direction. Both call this so the two controls can never drift out of
 * sync. Lives outside any component file so importing it doesn't trip
 * `react-refresh/only-export-components`.
 */
export function nextSort(current: ISuppliersSort, by: SupplierSortBy): ISuppliersSort {
  return {
    by,
    dir: current.by === by && current.dir === "desc" ? "asc" : "desc",
  };
}
