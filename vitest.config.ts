/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}", "supabase/functions/**/*.{test,spec}.ts"],
    // Mock-store isolation is opt-in per file (src/mocks/test-setup.ts →
    // resetMockStorePerFile). A global setupFile here forced pure-logic tests,
    // which never touch the mock layer, to pay the dataset bootstrap.
  },
});
