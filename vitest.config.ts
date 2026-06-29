/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}", "supabase/functions/**/*.{test,spec}.ts"],
    setupFiles: ["./src/mocks/test-setup.ts"],
  },
});
