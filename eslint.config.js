import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
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
  // PRD-004: lock the mock layer behind its public barrel.
  // Code outside `src/mocks/` must import from `@/mocks` (or `@/mocks/...`
  // sub-paths re-exported by the barrel), never from the internal store,
  // generators or data seeds.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/mocks/**"],
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
          ],
        },
      ],
    },
  },
  eslintPluginPrettier,
);
