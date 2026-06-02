import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// Resolve the current git branch at build/dev time so the dev footer can
// surface it. Falls back to Vercel's env var (detached HEAD on CI) and then
// to an empty string when git is unavailable.
function resolveGitBranch(): string {
  if (process.env.VERCEL_GIT_COMMIT_REF) return process.env.VERCEL_GIT_COMMIT_REF;
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

// SPA estática — sem SSR. Gera `dist/` com `index.html` + assets,
// pronto para a Vercel (ou qualquer host estático) servir como SPA.
export default defineConfig({
  define: {
    __GIT_BRANCH__: JSON.stringify(resolveGitBranch()),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  server: {
    // Fail fast instead of silently hopping to the next port (5174, 5175…)
    // when 5173 is taken. Prevents multiple concurrent dev-server instances
    // from coexisting and corrupting the shared optimizeDeps cache, which
    // surfaced as "more than one copy of React" / Invalid hook call errors.
    strictPort: true,
    watch: {
      // Nested git worktrees (`.claude/worktrees/*`) and brainstorm sessions
      // (`.superpowers/*`) are full repo copies with their own index.html /
      // tsconfig.json. Watching them makes Vite trigger reload loops and crash.
      ignored: ["**/.claude/**", "**/.superpowers/**"],
    },
  },
});
