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
