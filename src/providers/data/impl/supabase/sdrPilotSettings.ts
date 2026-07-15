import type { ID, ISdrPilotSettings } from "@/shared/types";
import type { ISdrPilotSettingsProvider } from "../../contracts/sdrPilotSettings";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link ISdrPilotSettingsProvider}. `ensureSettings`
 * lazily creates the store's row (defaults: disabled, 2min timeout) — mirrors
 * `rotationQueues`'s `ensureQueue` pattern. RLS: Owner-only read/write
 * (sdr_settings_owner_read/write, applied in the Parte A migration).
 */

interface SettingsRow {
  store_id: string;
  sdr_enabled: boolean;
  backstop_timeout_minutes: number;
  updated_at: string;
  updated_by: string | null;
}

const COLUMNS = "store_id, sdr_enabled, backstop_timeout_minutes, updated_at, updated_by";

function rowToSettings(r: SettingsRow): ISdrPilotSettings {
  return {
    storeId: r.store_id,
    sdrEnabled: r.sdr_enabled,
    backstopTimeoutMinutes: r.backstop_timeout_minutes,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}

async function ensureSettings(storeId: ID): Promise<ISdrPilotSettings> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("sdr_settings")
    .select(COLUMNS)
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw new Error(`[supabase] sdrPilotSettings.get failed: ${error.message}`);
  if (data) return rowToSettings(data as SettingsRow);
  const { data: created, error: insErr } = await client
    .from("sdr_settings")
    .insert({ store_id: storeId })
    .select(COLUMNS)
    .single();
  if (insErr) {
    // A concurrent create may have won the race — re-read.
    const { data: existing } = await client
      .from("sdr_settings")
      .select(COLUMNS)
      .eq("store_id", storeId)
      .maybeSingle();
    if (existing) return rowToSettings(existing as SettingsRow);
    throw new Error(`[supabase] sdrPilotSettings.create failed: ${insErr.message}`);
  }
  return rowToSettings(created as SettingsRow);
}

export const supabaseSdrPilotSettingsProvider: ISdrPilotSettingsProvider = {
  get: (storeId) => ensureSettings(storeId),

  async update(storeId, patch) {
    const current = await ensureSettings(storeId);
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.sdrEnabled !== undefined) row.sdr_enabled = patch.sdrEnabled;
    if (patch.backstopTimeoutMinutes !== undefined) {
      row.backstop_timeout_minutes = patch.backstopTimeoutMinutes;
    }
    const { data, error } = await getSupabaseClient()
      .from("sdr_settings")
      .update(row)
      .eq("store_id", current.storeId)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] sdrPilotSettings.update failed: ${error.message}`);
    return rowToSettings(data as SettingsRow);
  },
};
