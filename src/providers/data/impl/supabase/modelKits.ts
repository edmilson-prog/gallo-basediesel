import type { ID, IKitItem, IVehicleModelKit, ModelKitCategory } from "@/shared/types";
import type {
  ICreateModelKitInput,
  IListModelKitsParams,
  IModelKitsProvider,
  IUpdateModelKitPatch,
} from "../../contracts/modelKits";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link IModelKitsProvider} (PRD-034/035).
 *
 * snake_case `model_kits` table ↔ camelCase {@link IVehicleModelKit} via
 * `rowToModelKit`. Kit lines live in a dedicated `model_kit_items` table (one row
 * per line, FK `kit_id` ON DELETE CASCADE) and are hydrated by a second query
 * (`listItems`, mirroring `quotes.listItems`). Each line is a LIVE reference to a
 * catalog part (FK `part_id` → `parts`); no price/OEM snapshot lives here — that
 * happens on the quote item at apply time.
 *
 * `update` replaces the whole item set (delete + reinsert children) because the
 * editor patches `items` as a unit, mirroring the mock's merge semantics; the
 * scalar/jsonb-free columns on the parent are patched with `modelKitPatchToRow`.
 * `id`/`storeId`/`createdAt`/`createdBy` are immutable and never written.
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (create/update/delete) require the write policies that land with PRD-103.
 */

interface ModelKitRow {
  id: string;
  model_id: string;
  store_id: string;
  name: string;
  category: ModelKitCategory;
  status: IVehicleModelKit["status"];
  created_by: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

interface ModelKitItemRow {
  id: string;
  kit_id: string;
  part_id: string;
  default_quantity: number;
  is_optional: boolean;
  note: string | null;
}

const TABLE = "model_kits";
const ITEMS_TABLE = "model_kit_items";
const COLUMNS =
  "id, model_id, store_id, name, category, status, created_by, created_at, updated_at, updated_by";
const ITEM_COLUMNS = "id, kit_id, part_id, default_quantity, is_optional, note";

const ACTOR = "system";

function rowToKitItem(row: ModelKitItemRow): IKitItem {
  return {
    partId: row.part_id,
    defaultQuantity: row.default_quantity,
    isOptional: row.is_optional,
    note: row.note ?? undefined,
  };
}

function rowToModelKit(row: ModelKitRow, items: IKitItem[] = []): IVehicleModelKit {
  return {
    id: row.id,
    modelId: row.model_id,
    storeId: row.store_id,
    name: row.name,
    category: row.category,
    status: row.status,
    items,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? undefined,
  };
}

/** Builds a child insert row from an {@link IKitItem}, parented to `kitId`. */
function itemToRow(item: IKitItem, kitId: string): Record<string, unknown> {
  return {
    id: `${kitId}-item-${item.partId}`,
    kit_id: kitId,
    part_id: item.partId,
    default_quantity: item.defaultQuantity,
    is_optional: item.isOptional,
    note: item.note ?? null,
  };
}

/** Maps a camelCase patch to snake_case parent columns. `id`/`storeId`/`modelId`/
 *  `createdAt`/`createdBy` are immutable and the embedded `items` array is handled
 *  separately; `updatedAt`/`updatedBy` are set by the caller. */
function modelKitPatchToRow(patch: IUpdateModelKitPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.status !== undefined) row.status = patch.status;
  return row;
}

/** Hydrates the kit lines for a single kit (mirrors `quotes.listItems`). */
async function listItems(kitId: ID): Promise<IKitItem[]> {
  const { data, error } = await getSupabaseClient()
    .from(ITEMS_TABLE)
    .select(ITEM_COLUMNS)
    .eq("kit_id", kitId)
    .order("id", { ascending: true });
  if (error) throw new Error(`[supabase] modelKits.listItems(${kitId}) failed: ${error.message}`);
  return (data as ModelKitItemRow[]).map(rowToKitItem);
}

export const supabaseModelKitsProvider: IModelKitsProvider = {
  async list(params: IListModelKitsParams = {}): Promise<IVehicleModelKit[]> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS);

    if (params.modelId !== undefined) query = query.eq("model_id", params.modelId);
    if (params.status !== undefined) query = query.eq("status", params.status);
    if (params.category !== undefined) query = query.eq("category", params.category);
    if (params.search) query = query.ilike("name", `%${params.search}%`);

    const { data, error } = await query.order("created_at", { ascending: true });
    if (error) throw new Error(`[supabase] modelKits.list failed: ${error.message}`);

    const rows = data as unknown as ModelKitRow[];
    return Promise.all(rows.map(async (row) => rowToModelKit(row, await listItems(row.id))));
  },

  async get(id: ID): Promise<IVehicleModelKit> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`[supabase] modelKits.get(${id}) failed: ${error.message}`);

    const items = await listItems(id);
    return rowToModelKit(data as unknown as ModelKitRow, items);
  },

  async create(input: ICreateModelKitInput): Promise<IVehicleModelKit> {
    const id: ID = `mkit-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const client = getSupabaseClient();

    const { data, error } = await client
      .from(TABLE)
      .insert({
        id,
        model_id: input.modelId,
        store_id: input.storeId,
        name: input.name,
        category: input.category,
        status: input.status ?? "rascunho",
        created_by: ACTOR,
        created_at: now,
        updated_at: now,
        updated_by: null,
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] modelKits.create failed: ${error.message}`);

    if (input.items.length > 0) {
      const { error: itemsError } = await client
        .from(ITEMS_TABLE)
        .insert(input.items.map((item) => itemToRow(item, id)));
      if (itemsError)
        throw new Error(`[supabase] modelKits.create (items) failed: ${itemsError.message}`);
    }

    const items = await listItems(id);
    return rowToModelKit(data as unknown as ModelKitRow, items);
  },

  async update(id: ID, patch: IUpdateModelKitPatch): Promise<IVehicleModelKit> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from(TABLE)
      .update({
        ...modelKitPatchToRow(patch),
        updated_at: new Date().toISOString(),
        updated_by: ACTOR,
      })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] modelKits.update(${id}) failed: ${error.message}`);

    // The editor patches `items` as a unit: replace the whole child set.
    if (patch.items !== undefined) {
      const { error: deleteError } = await client.from(ITEMS_TABLE).delete().eq("kit_id", id);
      if (deleteError)
        throw new Error(`[supabase] modelKits.update (clear items) failed: ${deleteError.message}`);

      if (patch.items.length > 0) {
        const { error: insertError } = await client
          .from(ITEMS_TABLE)
          .insert(patch.items.map((item) => itemToRow(item, id)));
        if (insertError)
          throw new Error(`[supabase] modelKits.update (items) failed: ${insertError.message}`);
      }
    }

    const items = await listItems(id);
    return rowToModelKit(data as unknown as ModelKitRow, items);
  },

  async delete(id: ID): Promise<void> {
    // `model_kit_items` rows cascade via the FK ON DELETE CASCADE.
    const { error } = await getSupabaseClient().from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`[supabase] modelKits.delete(${id}) failed: ${error.message}`);
  },
};
