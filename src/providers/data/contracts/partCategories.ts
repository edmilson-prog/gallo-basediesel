import type { ID, IPartCategory, PartCategory } from "@/shared/types";

export interface IListPartCategoriesParams {
  storeId?: ID;
  /** When true, drops archived families (pickers). Default: return all. */
  activeOnly?: boolean;
}

export interface ISavePartCategoryInput {
  storeId?: ID;
  /**
   * Slug written to `parts.category`. Identifies the row: saving an existing
   * `value` updates it, saving a new one inserts. Overriding a built-in family
   * means saving its slug (e.g. `filtro`).
   */
  value: PartCategory;
  label: string;
  icon: string;
  /** Curated palette id — see PART_CATEGORY_PALETTE. */
  color: string;
  position?: number;
  archived?: boolean;
}

/**
 * Owner-managed catalog of part families.
 *
 * This is an override-and-extend layer over the built-in taxonomy, not a
 * replacement: consumers merge these rows onto `BUILTIN_PART_CATEGORY_DESCRIPTORS`,
 * so an empty (or unreachable) table yields exactly the built-in behaviour.
 *
 * Usage counts are deliberately absent — the catalog screens already hold the
 * full parts dataset client-side and count locally, which is both exact and
 * free. See the 2026-08-14 part-categories spec.
 */
export interface IPartCategoriesProvider {
  list(params?: IListPartCategoriesParams): Promise<IPartCategory[]>;
  /** Upsert by (storeId, value). */
  save(input: ISavePartCategoryInput): Promise<IPartCategory>;
  /**
   * Hard delete. Removing an override restores the built-in family; removing a
   * custom family is only offered by the UI when no part still references it.
   */
  delete(id: ID): Promise<void>;
}
