import type { ID, IPartCategory } from "@/shared/types";
import { getSupabaseClient } from "@/shared/lib/supabase";
import type {
  IListPartCategoriesParams,
  IPartCategoriesProvider,
  ISavePartCategoryInput,
} from "../../contracts/partCategories";

/**
 * Supabase implementation of {@link IPartCategoriesProvider}. RLS scopes reads
 * to the caller's store and restricts writes to the Owner — the provider stays
 * a thin mapper (same shape as conversationTags).
 */

interface IRow {
  id: string;
  store_id: string;
  value: string;
  label: string;
  icon: string;
  color: string;
  position: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  "id, store_id, value, label, icon, color, position, archived, created_at, updated_at";

function rowToCategory(row: IRow): IPartCategory {
  return {
    id: row.id,
    storeId: row.store_id,
    value: row.value,
    label: row.label,
    icon: row.icon,
    color: row.color,
    position: row.position,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const supabasePartCategoriesProvider: IPartCategoriesProvider = {
  async list(params?: IListPartCategoriesParams): Promise<IPartCategory[]> {
    let query = getSupabaseClient()
      .from("part_categories")
      .select(COLUMNS)
      .order("position")
      .order("label");
    if (params?.storeId) query = query.eq("store_id", params.storeId);
    if (params?.activeOnly) query = query.eq("archived", false);
    const { data, error } = await query;
    if (error) throw new Error(`partCategories.list: ${error.message}`);
    return ((data ?? []) as IRow[]).map(rowToCategory);
  },

  async save(input: ISavePartCategoryInput): Promise<IPartCategory> {
    const payload: Record<string, unknown> = {
      // store_id is NOT NULL — RLS also pins it to current_store_id().
      ...(input.storeId ? { store_id: input.storeId } : {}),
      value: input.value,
      label: input.label,
      icon: input.icon,
      color: input.color,
      updated_at: new Date().toISOString(),
    };
    if (input.position !== undefined) payload.position = input.position;
    if (input.archived !== undefined) payload.archived = input.archived;

    // Upsert on the (store_id, value) unique index — saving a built-in slug
    // creates its override row, saving it again edits that same row.
    const { data, error } = await getSupabaseClient()
      .from("part_categories")
      .upsert(payload, { onConflict: "store_id,value" })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`partCategories.save: ${error.message}`);
    return rowToCategory(data as IRow);
  },

  async delete(id: ID): Promise<void> {
    const { error } = await getSupabaseClient().from("part_categories").delete().eq("id", id);
    if (error) throw new Error(`partCategories.delete: ${error.message}`);
  },
};
