import type { ID, IVehicleModel, VehicleModelStatus } from "@/shared/types";
import type {
  ICreateVehicleModelInput,
  IListVehicleModelsParams,
  IUpdateVehicleModelPatch,
  IVehicleModelsProvider,
} from "../../contracts/vehicleModels";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link IVehicleModelsProvider} (PRD-034).
 *
 * Canonical vehicle-model catalog — reference data, NOT store-scoped. snake_case
 * table ↔ camelCase {@link IVehicleModel} via `rowToVehicleModel`. Reads work
 * today under the temporary permissive RLS; the mutations (create/update/delete)
 * require the write policies that land with PRD-103.
 */

interface VehicleModelRow {
  id: string;
  brand: string;
  model: string;
  engine: string;
  year_start: number | null;
  year_end: number | null;
  status: VehicleModelStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

const TABLE = "vehicle_models";
const COLUMNS =
  "id, brand, model, engine, year_start, year_end, status, created_by, created_at, updated_at, updated_by";

// Actor recorded on writes until the auth context is wired into this layer (PRD-103).
const SUPABASE_ACTOR: ID = "supabase-user";

function rowToVehicleModel(row: VehicleModelRow): IVehicleModel {
  return {
    id: row.id,
    brand: row.brand,
    model: row.model,
    engine: row.engine,
    yearStart: row.year_start ?? undefined,
    yearEnd: row.year_end ?? undefined,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? undefined,
  };
}

/** Maps a camelCase update patch to snake_case columns. `id`/`createdBy`/
 *  `createdAt` are immutable and never written here. */
function vehicleModelPatchToRow(patch: IUpdateVehicleModelPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.brand !== undefined) row.brand = patch.brand;
  if (patch.model !== undefined) row.model = patch.model;
  if (patch.engine !== undefined) row.engine = patch.engine;
  if (patch.yearStart !== undefined) row.year_start = patch.yearStart;
  if (patch.yearEnd !== undefined) row.year_end = patch.yearEnd;
  if (patch.status !== undefined) row.status = patch.status;
  return row;
}

export const supabaseVehicleModelsProvider: IVehicleModelsProvider = {
  async list(params?: IListVehicleModelsParams): Promise<IVehicleModel[]> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS);
    if (params?.brand) query = query.eq("brand", params.brand);
    if (params?.status) query = query.eq("status", params.status);
    if (params?.search) {
      const needle = params.search.trim();
      if (needle) {
        const escaped = needle.replace(/[%_,]/g, (m) => `\\${m}`);
        query = query.or(
          `brand.ilike.%${escaped}%,model.ilike.%${escaped}%,engine.ilike.%${escaped}%`,
        );
      }
    }

    const { data, error } = await query.order("created_at", { ascending: true });
    if (error) throw new Error(`[supabase] vehicleModels.list failed: ${error.message}`);
    return (data as VehicleModelRow[]).map(rowToVehicleModel);
  },

  async get(id: ID): Promise<IVehicleModel> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`[supabase] vehicleModels.get(${id}) failed: ${error.message}`);
    return rowToVehicleModel(data as VehicleModelRow);
  },

  async create(input: ICreateVehicleModelInput): Promise<IVehicleModel> {
    const now = new Date().toISOString();
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert({
        brand: input.brand,
        model: input.model,
        engine: input.engine,
        year_start: input.yearStart ?? null,
        year_end: input.yearEnd ?? null,
        status: "ativo",
        created_by: SUPABASE_ACTOR,
        created_at: now,
        updated_at: now,
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] vehicleModels.create failed: ${error.message}`);
    return rowToVehicleModel(data as VehicleModelRow);
  },

  async update(id: ID, patch: IUpdateVehicleModelPatch): Promise<IVehicleModel> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({
        ...vehicleModelPatchToRow(patch),
        updated_at: new Date().toISOString(),
        updated_by: SUPABASE_ACTOR,
      })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] vehicleModels.update(${id}) failed: ${error.message}`);
    return rowToVehicleModel(data as VehicleModelRow);
  },

  async delete(id: ID): Promise<void> {
    const { error } = await getSupabaseClient().from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`[supabase] vehicleModels.delete(${id}) failed: ${error.message}`);
  },
};
