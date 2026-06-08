/**
 * Resolves the active authentication backend from `VITE_AUTH_SOURCE` (PRD-107).
 *
 * Build-time only, mirroring the data-layer `getDataProviders()` switch. Invalid
 * values fall back to `mock` with a dev-only warning.
 */
export type AuthSource = "mock" | "supabase";

const VALID_SOURCES: readonly AuthSource[] = ["mock", "supabase"];

function resolveAuthSource(): AuthSource {
  const raw = import.meta.env.VITE_AUTH_SOURCE;
  if (raw && (VALID_SOURCES as readonly string[]).includes(raw)) {
    return raw as AuthSource;
  }
  if (raw && import.meta.env.DEV) {
    console.warn(`[auth] invalid VITE_AUTH_SOURCE="${raw}" — falling back to "mock".`);
  }
  return "mock";
}

export const AUTH_SOURCE: AuthSource = resolveAuthSource();
