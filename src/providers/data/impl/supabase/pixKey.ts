import type { ID, IPixKey } from "@/shared/types";
import type { IPixKeyProvider } from "../../contracts/pixKey";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link IPixKeyProvider} (PIX shortcut, design
 * 2026-08-07).
 *
 * snake_case `pix_keys` table ↔ camelCase {@link IPixKey} via `rowToPixKey`.
 * A PIX key is store-owned, not seller-owned: RLS lets the whole store read
 * (the attendant needs the key to send it) but restricts writes to staff
 * (Owner/Gestor) — registering a company PIX key is a fraud surface, unlike
 * `quick_replies` which is per-seller. `id`/`storeId`/`createdAt` are
 * immutable and never written by `pixKeyPatchToRow`; `updatedAt` is stamped
 * by the caller on each mutation.
 *
 * Unlike `quick_replies` (a `text` PK with no DB-side default, predating the
 * project-wide uuid conversion — 20260608182429_convert_reference_pks_to_uuid),
 * `pix_keys.id` is `uuid primary key default gen_random_uuid()` — the current
 * convention for every table created since. `create` therefore omits `id`
 * from the insert and reads the DB-generated value back, mirroring
 * `conversationTags.ts` rather than `quickReply.ts` on this one point.
 */

interface PixKeyRow {
  id: string;
  store_id: string;
  alias: string;
  key_type: IPixKey["keyType"];
  key_value: string;
  receiver_name: string;
  receiver_city: string;
  default_context: string | null;
  shortcut: string | null;
  default_send_text: boolean;
  default_send_qr: boolean;
  is_default: boolean;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const TABLE = "pix_keys";
const COLUMNS =
  "id, store_id, alias, key_type, key_value, receiver_name, receiver_city, " +
  "default_context, shortcut, default_send_text, default_send_qr, is_default, " +
  "is_active, created_by, created_at, updated_at";

function rowToPixKey(row: PixKeyRow): IPixKey {
  return {
    id: row.id,
    storeId: row.store_id,
    alias: row.alias,
    keyType: row.key_type,
    keyValue: row.key_value,
    receiverName: row.receiver_name,
    receiverCity: row.receiver_city,
    defaultContext: row.default_context ?? undefined,
    shortcut: row.shortcut ?? undefined,
    defaultSendText: row.default_send_text,
    defaultSendQr: row.default_send_qr,
    isDefault: row.is_default,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Maps a camelCase patch to snake_case columns. `id`/`storeId`/`createdAt` are
 *  immutable and never written; `updatedAt` is set by the caller. */
function pixKeyPatchToRow(patch: Partial<IPixKey>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.alias !== undefined) row.alias = patch.alias;
  if (patch.keyType !== undefined) row.key_type = patch.keyType;
  if (patch.keyValue !== undefined) row.key_value = patch.keyValue;
  if (patch.receiverName !== undefined) row.receiver_name = patch.receiverName;
  if (patch.receiverCity !== undefined) row.receiver_city = patch.receiverCity;
  if (patch.defaultContext !== undefined) row.default_context = patch.defaultContext ?? null;
  if (patch.shortcut !== undefined) row.shortcut = patch.shortcut ?? null;
  if (patch.defaultSendText !== undefined) row.default_send_text = patch.defaultSendText;
  if (patch.defaultSendQr !== undefined) row.default_send_qr = patch.defaultSendQr;
  if (patch.isDefault !== undefined) row.is_default = patch.isDefault;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.createdBy !== undefined) row.created_by = patch.createdBy;
  return row;
}

/** Maps a create input onto an insert row. `id` is omitted — the DB default
 *  (`gen_random_uuid()`) generates it and the caller reads it back. */
function createInputToRow(
  input: Omit<IPixKey, "id" | "storeId" | "createdAt" | "updatedAt">,
  storeId: ID,
  nowIso: string,
): Record<string, unknown> {
  return {
    store_id: storeId,
    alias: input.alias,
    key_type: input.keyType,
    key_value: input.keyValue,
    receiver_name: input.receiverName,
    receiver_city: input.receiverCity,
    default_context: input.defaultContext ?? null,
    shortcut: input.shortcut ?? null,
    default_send_text: input.defaultSendText,
    default_send_qr: input.defaultSendQr,
    is_default: input.isDefault,
    is_active: input.isActive,
    created_by: input.createdBy,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

export const supabasePixKeyProvider: IPixKeyProvider = {
  async list(params: { storeId?: ID; activeOnly?: boolean }): Promise<IPixKey[]> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS);

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
    if (params.activeOnly) query = query.eq("is_active", true);

    const { data, error } = await query.order("created_at", { ascending: true });
    if (error) throw new Error(`[supabase] pixKey.list failed: ${error.message}`);
    return (data as unknown as PixKeyRow[]).map(rowToPixKey);
  },

  async get(id: ID): Promise<IPixKey | null> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`[supabase] pixKey.get(${id}) failed: ${error.message}`);
    return data ? rowToPixKey(data as unknown as PixKeyRow) : null;
  },

  async create(
    input: Omit<IPixKey, "id" | "storeId" | "createdAt" | "updatedAt">,
  ): Promise<IPixKey> {
    // `storeId` is stripped from the create input by the contract; the scoped
    // mock provider injects it. Mirror that here, reading it off the input when
    // the caller passes it through (cast to a permissive shape).
    const withStore = input as typeof input & { storeId?: ID };
    const storeId: ID = withStore.storeId ?? "";
    const nowIso = new Date().toISOString();

    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(createInputToRow(input, storeId, nowIso))
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] pixKey.create failed: ${error.message}`);
    return rowToPixKey(data as unknown as PixKeyRow);
  },

  async update(id: ID, patch: Partial<IPixKey>): Promise<IPixKey> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ ...pixKeyPatchToRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] pixKey.update(${id}) failed: ${error.message}`);
    return rowToPixKey(data as unknown as PixKeyRow);
  },

  async delete(id: ID): Promise<IPixKey> {
    // The contract returns the deleted key, so read it back before removing.
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .delete()
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] pixKey.delete(${id}) failed: ${error.message}`);
    return rowToPixKey(data as unknown as PixKeyRow);
  },
};
