import type { ID, IWhatsAppOpenWaServer } from "@/shared/types";
import type {
  ICreateOpenWaServerInput,
  IOpenWaServerPatch,
  IWhatsAppOpenWaServersProvider,
} from "../../contracts/whatsappOpenWaServers";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase impl of {@link IWhatsAppOpenWaServersProvider}. RLS keeps the table
 * Owner-only. Table-only: the global key lives in the Vault (written by the
 * screen via the integration-secrets Edge Function). `remove` relies on the FK
 * `whatsapp_accounts.openwa_server_id` (ON DELETE RESTRICT) — Postgres rejects
 * the delete when accounts are linked; we translate that into a friendly message.
 */

interface OpenWaServerRow {
  id: string;
  name: string;
  base_url: string;
  api_key_ref: string;
  created_at: string;
  updated_at: string | null;
}

const TABLE = "whatsapp_openwa_servers";
const COLUMNS = "id, name, base_url, api_key_ref, created_at, updated_at";

function rowToOpenWaServer(row: OpenWaServerRow): IWhatsAppOpenWaServer {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    apiKeyRef: row.api_key_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  };
}

export const supabaseWhatsAppOpenWaServersProvider: IWhatsAppOpenWaServersProvider = {
  async list(): Promise<IWhatsAppOpenWaServer[]> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`[supabase] openwaServers.list failed: ${error.message}`);
    return (data as unknown as OpenWaServerRow[]).map(rowToOpenWaServer);
  },

  async create(input: ICreateOpenWaServerInput): Promise<IWhatsAppOpenWaServer> {
    const row = {
      id: crypto.randomUUID(),
      name: input.name,
      base_url: input.baseUrl,
      api_key_ref: input.apiKeyRef,
    };
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(row)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] openwaServers.create failed: ${error.message}`);
    return rowToOpenWaServer(data as unknown as OpenWaServerRow);
  },

  async update(id: ID, patch: IOpenWaServerPatch): Promise<IWhatsAppOpenWaServer> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.baseUrl !== undefined) row.base_url = patch.baseUrl;
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update(row)
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] openwaServers.update(${id}) failed: ${error.message}`);
    return rowToOpenWaServer(data as unknown as OpenWaServerRow);
  },

  async remove(id: ID): Promise<void> {
    const { error } = await getSupabaseClient().from(TABLE).delete().eq("id", id);
    if (error) {
      // FK violation (23503) → an OpenWA account still points at this server.
      if (error.code === "23503") {
        throw new Error("Há números usando este servidor. Remova-os antes de excluí-lo.");
      }
      throw new Error(`[supabase] openwaServers.remove(${id}) failed: ${error.message}`);
    }
  },
};
