import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase browser client (Fase 2, PRDs 100+).
 *
 * Lazily-instantiated singleton, consumed ONLY by the Supabase provider
 * implementations in this folder. It lives under `providers/data/impl` so the
 * ESLint boundary keeps it private — features must go through the
 * `useXxxProvider()` hooks and never import this module directly.
 *
 * The client is created on first use (not at import time) so that bundling the
 * `supabaseProviders` set never crashes a `mock`-mode build when the Supabase
 * env vars are absent.
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
        "Set them in `.env.local` before running with VITE_DATA_SOURCE=supabase. " +
        "See `.env.example`.",
    );
  }

  client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      // Persist the session and silently refresh it. The real Supabase Auth ↔
      // AuthProvider wiring lands in PRD-107; these defaults are safe meanwhile.
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
