/**
 * Vault-first secret resolution for Edge Functions ("Integrações & Chaves").
 *
 * Secrets managed from the platform live encrypted in Supabase Vault and are
 * read through the service_role-only RPC `integration_secret_get`. Anything
 * not in the Vault falls back to the function's env secrets, so keys
 * configured the old way keep working — when both exist, the Vault wins
 * (a rotation done in the platform takes effect without redeploys).
 *
 * The resolver caches per instance: create one per request (or reuse the
 * function-lifetime one for app-level gates) — secrets are read at most once
 * per name per resolver.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";

export type VaultSecretResolver = (name: string) => Promise<string | undefined>;

export function createSecretResolver(admin: SupabaseClient): VaultSecretResolver {
  const cache = new Map<string, string | undefined>();
  return async (name: string) => {
    if (cache.has(name)) return cache.get(name);
    let value: string | undefined;
    try {
      const { data, error } = await admin.rpc("integration_secret_get", { p_name: name });
      if (!error && typeof data === "string" && data.length > 0) value = data;
    } catch (_err) {
      // Vault unreachable → fall back to env below (fail-open by design:
      // a Vault hiccup must not take WhatsApp/email down).
    }
    if (value === undefined) value = Deno.env.get(name);
    cache.set(name, value);
    return value;
  };
}
