import type { ID, IConversationTag } from "@/shared/types";
import { getSupabaseClient } from "@/shared/lib/supabase";
import type {
  IConversationTagsProvider,
  ICreateConversationTagInput,
  IListConversationTagsParams,
  IUpdateConversationTagInput,
} from "../../contracts/conversationTags";

/**
 * Supabase implementation of {@link IConversationTagsProvider}. RLS scopes
 * reads to the caller's store and restricts writes to the Owner — the
 * provider stays a thin mapper (same shape as messageTemplates).
 */

interface IRow {
  id: string;
  store_id: string;
  label: string;
  color: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

const COLUMNS = "id, store_id, label, color, archived, created_at, updated_at";

function rowToTag(row: IRow): IConversationTag {
  return {
    id: row.id,
    storeId: row.store_id,
    label: row.label,
    color: row.color,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const supabaseConversationTagsProvider: IConversationTagsProvider = {
  async list(params?: IListConversationTagsParams): Promise<IConversationTag[]> {
    let query = getSupabaseClient().from("conversation_tags").select(COLUMNS).order("label");
    if (params?.storeId) query = query.eq("store_id", params.storeId);
    if (params?.activeOnly) query = query.eq("archived", false);
    const { data, error } = await query;
    if (error) throw new Error(`conversationTags.list: ${error.message}`);
    return ((data ?? []) as IRow[]).map(rowToTag);
  },

  async create(input: ICreateConversationTagInput): Promise<IConversationTag> {
    const { data, error } = await getSupabaseClient()
      .from("conversation_tags")
      .insert({
        // store_id is NOT NULL — RLS also pins it to current_store_id().
        ...(input.storeId ? { store_id: input.storeId } : {}),
        label: input.label,
        color: input.color,
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`conversationTags.create: ${error.message}`);
    return rowToTag(data as IRow);
  },

  async update(id: ID, input: IUpdateConversationTagInput): Promise<IConversationTag> {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.label !== undefined) patch.label = input.label;
    if (input.color !== undefined) patch.color = input.color;
    if (input.archived !== undefined) patch.archived = input.archived;
    const { data, error } = await getSupabaseClient()
      .from("conversation_tags")
      .update(patch)
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`conversationTags.update: ${error.message}`);
    return rowToTag(data as IRow);
  },

  async delete(id: ID): Promise<void> {
    const { error } = await getSupabaseClient().from("conversation_tags").delete().eq("id", id);
    if (error) throw new Error(`conversationTags.delete: ${error.message}`);
  },

  async usageCount(storeId?: ID): Promise<Record<ID, number>> {
    const tags = await this.list(storeId ? { storeId } : undefined);
    const client = getSupabaseClient();
    const counts = await Promise.all(
      tags.map(async (tag) => {
        let query = client
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .overlaps("tags", [tag.id]);
        if (storeId) query = query.eq("store_id", storeId);
        const { count, error } = await query;
        if (error) throw new Error(`conversationTags.usageCount: ${error.message}`);
        return [tag.id, count ?? 0] as const;
      }),
    );
    return Object.fromEntries(counts);
  },
};
