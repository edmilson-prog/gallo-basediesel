import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared Supabase browser client (Fase 2, PRDs 100+).
 *
 * Single instance consumed by everything that talks to Supabase: the data
 * provider implementations (`providers/data/impl/supabase/*`) and the auth
 * backend (`features/auth/SupabaseAuthProvider`). Lives under `shared/` so both
 * can import it without crossing the ESLint data-layer boundary.
 *
 * Lazily instantiated (created on first use, not at import time) so that
 * bundling never crashes a `mock`-mode build when the Supabase env vars are
 * absent.
 *
 * TODO(PRD-101): once the schema migrations land, run the Supabase type
 * generator and parametrize `createClient<Database>` for end-to-end type safety
 * on every query.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

let client: SupabaseClient | null = null;

/**
 * Returns the memoized Supabase client, creating it on first call.
 *
 * @throws when the connection env vars are missing — surfaced only if something
 * actually tries to use Supabase without configuring `.env.local`.
 */
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "[supabase] Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. " +
        "Set them in `.env.local` before running with VITE_DATA_SOURCE=supabase " +
        "or VITE_AUTH_SOURCE=supabase. See `.env.example`.",
    );
  }

  client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      // Persist the session and silently refresh it.
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return client;
}

/**
 * Test-only hook to reset the memoized client between cases that stub env vars.
 * Not for production code.
 */
export function __resetSupabaseClientForTests(): void {
  client = null;
}
