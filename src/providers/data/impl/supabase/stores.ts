import type { Division, ID, IPlatformSettings, IStore } from "@/shared/types";
import type { IStoresProvider } from "../../contracts/stores";
import { getSupabaseClient } from "./client";

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
  // POC seed stores a faithful subset of IPlatformSettings; trusted via cast.
  settings: IPlatformSettings;
  active_divisions: Division[];
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
    settings: row.settings,
    activeDivisions: row.active_divisions,
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
};
