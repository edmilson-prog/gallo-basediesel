import type { ID, IWahaServer } from "@/shared/types";
import type {
  ICreateWahaServerInput,
  IWahaServerPatch,
  IWahaServersProvider,
} from "../../contracts/wahaServers";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase impl of {@link IWahaServersProvider}. RLS keeps the table
 * Owner-only. Table-only: the API key and webhook HMAC secret live in the
 * Vault (written by the screen via the integration-secrets Edge Function).
 * `remove` relies on the FK `whatsapp_accounts.waha_server_id`
 * (ON DELETE RESTRICT) — Postgres rejects the delete when sessions are
 * linked; we translate that into a friendly message.
 */

interface WahaServerRow {
  id: string;
  name: string;
  base_url: string;
  api_key_ref: string;
  webhook_hmac_ref: string | null;
  created_at: string;
  updated_at: string | null;
}

const TABLE = "waha_servers";
const COLUMNS = "id, name, base_url, api_key_ref, webhook_hmac_ref, created_at, updated_at";

function rowToServer(row: WahaServerRow): IWahaServer {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    apiKeyRef: row.api_key_ref,
    webhookHmacRef: row.webhook_hmac_ref ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  };
}

export const supabaseWahaServersProvider: IWahaServersProvider = {
  async list(): Promise<IWahaServer[]> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`[supabase] wahaServers.list failed: ${error.message}`);
    return (data as unknown as WahaServerRow[]).map(rowToServer);
  },

  async create(input: ICreateWahaServerInput): Promise<IWahaServer> {
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
    if (error) throw new Error(`[supabase] wahaServers.create failed: ${error.message}`);
    return rowToServer(data as unknown as WahaServerRow);
  },

  async update(id: ID, patch: IWahaServerPatch): Promise<IWahaServer> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.baseUrl !== undefined) row.base_url = patch.baseUrl;
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update(row)
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] wahaServers.update(${id}) failed: ${error.message}`);
    return rowToServer(data as unknown as WahaServerRow);
  },

  async setWebhookHmacRef(id: ID, hmacRef: string | null): Promise<IWahaServer> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ webhook_hmac_ref: hmacRef, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) {
      throw new Error(`[supabase] wahaServers.setWebhookHmacRef(${id}) failed: ${error.message}`);
    }
    return rowToServer(data as unknown as WahaServerRow);
  },

  async remove(id: ID): Promise<void> {
    const { error } = await getSupabaseClient().from(TABLE).delete().eq("id", id);
    if (error) {
      if (error.code === "23503") {
        throw new Error("Há sessões usando este servidor. Remova-as antes de excluí-lo.");
      }
      throw new Error(`[supabase] wahaServers.remove(${id}) failed: ${error.message}`);
    }
  },
};
