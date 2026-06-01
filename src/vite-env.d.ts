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

  /**
   * Factory default for where the Sales Copilot surface renders on the
   * conversation screen (PRD-025).
   *
   * - `"strip"` (default) — collapsible strip above the message input.
   * - `"card"` — collapsible card at the top of the conversation.
   * - `"tab"` — dedicated tab inside the customer fiche.
   *
   * This is only the build-time **default**. Users override it at runtime in
   * Configurações → Copiloto (persisted in `localStorage`).
   *
   * @see src/features/copilot/config.ts
   */
  readonly VITE_COPILOT_PLACEMENT?: "strip" | "tab" | "card";
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
