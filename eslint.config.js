import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", ".claude", ".superpowers"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },

  // PRD-004 / PRD-005: lock the mock layer behind its public barrel and route
  // every data-access call through the providers layer.
  //
  // Default policy for every file under `src/`:
  //  - Internal mock modules (store/generators/data/config) are private.
  //  - Direct mock API imports (`@/mocks`, `@/mocks/api/*`) are forbidden —
  //    features must consume data through `@/providers/data` hooks.
  //  - Provider implementations (`@/providers/data/impl/*`) are private —
  //    only the factory may import them.
  //  - Individual provider contracts (`@/providers/data/contracts/*`) are
  //    private — features re-export through `@/providers/data`.
  //  - The provider factory (`@/providers/data/factory`) is private — the
  //    Context component is the only legitimate consumer.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/mocks/**", "src/providers/data/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/mocks/store/*",
                "@/mocks/generators/*",
                "@/mocks/data/*",
                "@/mocks/config",
              ],
              message:
                "Import the mock layer only from '@/mocks' — internal modules are not part of the public contract.",
            },
            {
              group: ["**/mocks/store/*", "**/mocks/generators/*", "**/mocks/data/*"],
              message:
                "Import the mock layer only from '@/mocks' — internal modules are not part of the public contract.",
            },
            {
              group: ["@/mocks", "@/mocks/api", "@/mocks/api/*"],
              message:
                "Features must consume data via '@/providers/data' hooks (PRD-005). Direct mock API imports are forbidden outside the mock provider implementation.",
            },
            {
              group: ["@/providers/data/impl/*", "**/providers/data/impl/*"],
              message:
                "Provider implementations are private — consume the public surface from '@/providers/data' instead.",
            },
            {
              group: ["@/providers/data/contracts/*", "**/providers/data/contracts/*"],
              message:
                "Import contract types from '@/providers/data' barrel — individual contract files are internal.",
            },
            {
              group: ["@/providers/data/factory", "**/providers/data/factory"],
              message:
                "The provider factory is internal — use '@/providers/data' (DataProvidersProvider + hooks).",
            },
          ],
        },
      ],
    },
  },

  // Mock provider implementations are the single authorized bridge between
  // `@/mocks` and the rest of the app — they may import the mock barrel.
  {
    files: ["src/providers/data/impl/mock/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/mocks/store/*",
                "@/mocks/generators/*",
                "@/mocks/data/*",
                "@/mocks/config",
              ],
              message:
                "Even inside the mock provider, internal mock modules stay private — go through '@/mocks'.",
            },
          ],
        },
      ],
    },
  },

  // The dev-only design-system route consumes `useResetMocks` (a mock seed
  // utility, not a data API) — explicit allow.
  {
    files: ["src/routes/design-system.tsx"],
    rules: {
      "no-restricted-imports": "off",
    },
  },

  eslintPluginPrettier,
);
