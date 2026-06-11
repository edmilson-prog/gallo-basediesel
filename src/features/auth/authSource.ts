/**
 * Resolves the active authentication backend (PRD-107).
 *
 * Resolved ONCE at boot, mirroring the data-layer `getDataProviders()` switch:
 * a per-browser override (Configurações → Ambiente & Dados, localStorage) takes
 * precedence over the build-time `VITE_AUTH_SOURCE`; invalid values fall back
 * to `mock` with a dev-only warning. Applying a change reloads the page.
 */
import {
  AUTH_SOURCE_OVERRIDE_KEY,
  readSourceOverride,
  resolveSourceMode,
} from "@/shared/lib/environmentMode";

export type AuthSource = "mock" | "supabase";

const VALID_SOURCES: readonly AuthSource[] = ["mock", "supabase"];

function resolveAuthSource(): AuthSource {
  const raw = import.meta.env.VITE_AUTH_SOURCE;
  const override = readSourceOverride(AUTH_SOURCE_OVERRIDE_KEY);
  if (!override && raw && !(VALID_SOURCES as readonly string[]).includes(raw)) {
    if (import.meta.env.DEV) {
      console.warn(`[auth] invalid VITE_AUTH_SOURCE="${raw}" — falling back to "mock".`);
    }
  }
  return resolveSourceMode(raw, override);
}

export const AUTH_SOURCE: AuthSource = resolveAuthSource();
