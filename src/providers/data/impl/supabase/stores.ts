import type { Division, ID, IPlatformSettings, IStore } from "@/shared/types";
import type { IStoresProvider } from "../../contracts/stores";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { buildDefaultSettings } from "../../engine/buildDefaultSettings";

/**
 * Supabase implementation of {@link IStoresProvider} — the first Fase 2
 * vertical slice (POC for PRD-104).
 *
 * Establishes the convention for the remaining providers: the table uses
 * snake_case columns, and this layer maps each row back to the camelCase
 * {@link IStore} the UI consumes via `rowToStore`. Read-only, mirroring the
 * mock provider.
 */

/** Raw row shape returned by PostgREST (snake_case, mirrors the DB columns). */
interface StoreRow {
  id: string;
  name: string;
  type: IStore["type"];
  address: string;
  cnpj: string;
  manager_id: string | null;
  // POC seed stores a faithful subset of IPlatformSettings; trusted via cast.
  settings: IPlatformSettings;
  active_divisions: Division[];
  is_active: boolean | null;
  created_at: string;
}

const TABLE = "stores";

function rowToStore(row: StoreRow): IStore {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    address: row.address,
    cnpj: row.cnpj,
    managerId: row.manager_id ?? undefined,
    settings: row.settings,
    activeDivisions: row.active_divisions,
    // Fallback `true` tolerates rows read before the is_active migration lands.
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
  };
}

export const supabaseStoresProvider: IStoresProvider = {
  async list(): Promise<IStore[]> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`[supabase] stores.list failed: ${error.message}`);
    }
    return (data as StoreRow[]).map(rowToStore);
  },

  async get(id: ID): Promise<IStore> {
    const { data, error } = await getSupabaseClient().from(TABLE).select("*").eq("id", id).single();

    if (error) {
      throw new Error(`[supabase] stores.get(${id}) failed: ${error.message}`);
    }
    return rowToStore(data as StoreRow);
  },

  async create(input) {
    // Client generates the id so settings.storeId matches the real store id.
    const id = crypto.randomUUID();
    const settings = input.settings ?? buildDefaultSettings(id);
    const { data, error } = await getSupabaseClient().rpc("create_store", {
      p_id: id,
      p_name: input.name,
      p_type: input.type,
      p_cnpj: input.cnpj,
      p_address: input.address,
      p_manager_id: input.managerId ?? null,
      p_active_divisions: input.activeDivisions,
      p_settings: settings,
    });
    if (error) throw new Error(`[supabase] stores.create failed: ${error.message}`);
    return rowToStore(data as StoreRow);
  },

  async update(id, patch) {
    const { data, error } = await getSupabaseClient().rpc("update_store", {
      p_id: id,
      p_name: patch.name ?? null,
      p_cnpj: patch.cnpj ?? null,
      p_address: patch.address ?? null,
      p_manager_id: patch.managerId ?? null,
      p_active_divisions: patch.activeDivisions ?? null,
    });
    if (error) throw new Error(`[supabase] stores.update(${id}) failed: ${error.message}`);
    return rowToStore(data as StoreRow);
  },

  async setActive(id, active) {
    const { data, error } = await getSupabaseClient().rpc("set_store_active", {
      p_id: id,
      p_active: active,
    });
    if (error) throw new Error(`[supabase] stores.setActive(${id}) failed: ${error.message}`);
    return rowToStore(data as StoreRow);
  },
};
