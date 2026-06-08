import type { ID, IPlatformSettings } from "@/shared/types";
import type { ISettingsProvider } from "../../contracts/settings";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link ISettingsProvider} (PRD-105+).
 *
 * SPECIAL CASE: per-store {@link IPlatformSettings} is NOT a table of its own —
 * it lives in the `settings` jsonb column of the already-created `public.stores`
 * row (see `impl/supabase/stores.ts`). This provider therefore reads/writes
 * `stores.settings` directly; no `settings` table exists.
 *
 * `update` mirrors the mock's shallow merge semantics exactly: it reads the
 * current settings blob, spreads the camelCase `patch` over it, re-stamps
 * `storeId`, and writes the whole object back. Top-level keys provided in the
 * patch fully replace their previous value (no deep merge), matching
 * `{ ...settings, ...patch, storeId }` in the mock. The write is guarded by the
 * write policies that land with PRD-103.
 */

/** Raw row shape returned by PostgREST when selecting the settings column. */
interface StoreSettingsRow {
  settings: IPlatformSettings;
}

const TABLE = "stores";

export const supabaseSettingsProvider: ISettingsProvider = {
  async get(storeId: ID): Promise<IPlatformSettings> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select("settings")
      .eq("id", storeId)
      .single();

    if (error) {
      throw new Error(`[supabase] settings.get(${storeId}) failed: ${error.message}`);
    }
    return (data as StoreSettingsRow).settings;
  },

  async update(storeId: ID, patch: Partial<IPlatformSettings>): Promise<IPlatformSettings> {
    const client = getSupabaseClient();

    // Read the current blob first; PostgREST cannot shallow-merge a jsonb column
    // server-side, so the merge happens in-app to match the mock semantics.
    const { data: current, error: readError } = await client
      .from(TABLE)
      .select("settings")
      .eq("id", storeId)
      .single();

    if (readError) {
      throw new Error(`[supabase] settings.update(${storeId}) failed: ${readError.message}`);
    }

    const merged: IPlatformSettings = {
      ...(current as StoreSettingsRow).settings,
      ...patch,
      storeId,
    };

    const { data, error } = await client
      .from(TABLE)
      .update({ settings: merged })
      .eq("id", storeId)
      .select("settings")
      .single();

    if (error) {
      throw new Error(`[supabase] settings.update(${storeId}) failed: ${error.message}`);
    }
    return (data as StoreSettingsRow).settings;
  },
};
