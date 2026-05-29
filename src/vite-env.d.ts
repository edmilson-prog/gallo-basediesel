/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Selects which data provider implementation the factory returns.
   *
   * - `"mock"` (default in Fase 1) — delegates every call to `src/mocks/api/*`.
   * - `"supabase"` (Fase 2) — delegates to Supabase. Stubs throw
   *   `NotImplementedError` until each contract is wired in PRDs 100+.
   *
   * Set in `.env` / `.env.local`. Build-time only; runtime switching is not
   * supported by design.
   *
   * @see src/providers/data/factory.ts
   * @see docs/provider-pattern.md
   */
  readonly VITE_DATA_SOURCE?: "mock" | "supabase";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Build-time constants injected by Vite `define` (see vite.config.ts).
 *
 * - `__GIT_BRANCH__` — current git branch, surfaced by the dev-only footer.
 *   Empty string when git is unavailable (e.g. some CI environments).
 * - `__APP_VERSION__` — version field from package.json, used as a fallback
 *   while the CHANGELOG-derived version is still loading.
 */
declare const __GIT_BRANCH__: string;
declare const __APP_VERSION__: string;
