/**
 * Runtime environment-mode override (Configurações → Ambiente & Dados).
 *
 * The app resolves its data/auth sources ONCE at boot (factory.ts and
 * authSource.ts). This module adds a per-browser override persisted in
 * localStorage that takes precedence over the build-time env vars — applying
 * a change requires a full page reload, never a live re-mount.
 *
 * NOT a security boundary: the override only selects which client-side code
 * path boots. RLS and Supabase Auth keep protecting the real data regardless
 * of what a visitor writes into localStorage.
 */

export type SourceMode = "mock" | "supabase";

/** localStorage keys, following the `gallo-*` convention (see config/themes.ts). */
export const DATA_SOURCE_OVERRIDE_KEY = "gallo-data-source-override";
export const AUTH_SOURCE_OVERRIDE_KEY = "gallo-auth-source-override";

const VALID_MODES: readonly SourceMode[] = ["mock", "supabase"] as const;

/** Validates a raw string into a SourceMode (null when invalid/absent). */
export function parseSourceMode(raw: string | null | undefined): SourceMode | null {
  if (raw && (VALID_MODES as readonly string[]).includes(raw)) return raw as SourceMode;
  return null;
}

/**
 * Resolution order shared by the data and auth switches:
 * override (localStorage) > valid env var > "mock".
 */
export function resolveSourceMode(
  envRaw: string | null | undefined,
  override: SourceMode | null,
): SourceMode {
  if (override) return override;
  return parseSourceMode(envRaw) ?? "mock";
}

/** Reads a persisted override (null when unset, invalid or storage unavailable). */
export function readSourceOverride(key: string): SourceMode | null {
  if (typeof window === "undefined") return null;
  try {
    return parseSourceMode(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

/** Persists (or clears, with `null`) an override. Safe under private mode. */
export function writeSourceOverride(key: string, value: SourceMode | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable — the override simply won't persist.
  }
}

/**
 * Friendly presets over the two dimensions. "custom" is any mixed combination
 * (e.g. real auth + demo data, used during cutover testing).
 */
export type EnvironmentPreset = "production" | "demo" | "custom";

export function presetOf(data: SourceMode, auth: SourceMode): EnvironmentPreset {
  if (data === "supabase" && auth === "supabase") return "production";
  if (data === "mock" && auth === "mock") return "demo";
  return "custom";
}

/** The two dimensions a preset expands to (custom never expands). */
export function presetSources(preset: Exclude<EnvironmentPreset, "custom">): {
  data: SourceMode;
  auth: SourceMode;
} {
  return preset === "production"
    ? { data: "supabase", auth: "supabase" }
    : { data: "mock", auth: "mock" };
}
