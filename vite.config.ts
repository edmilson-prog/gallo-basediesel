import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite";
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

// Unique id per build (git sha for readability + timestamp for uniqueness even
// on a redeploy of the same commit). Injected into the bundle AND emitted as
// /version.json in the SAME build process, so the two always match. The deploy
// watcher compares them at runtime to detect a new production deploy.
const BUILD_TIMESTAMP = Date.now();
function resolveBuildId(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const shaShort = sha ? sha.slice(0, 7) : "local";
  return `${shaShort}.${BUILD_TIMESTAMP}`;
}
const BUILD_ID = resolveBuildId();

// Emits version.json into the build output (dist/). Build-only: in `vite dev`
// the file is absent, which the watcher treats as "no info" (no false positive).
function versionManifestPlugin(): Plugin {
  return {
    name: "gallo-version-manifest",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ buildId: BUILD_ID, version: pkg.version }),
      });
    },
  };
}

/**
 * Serves `atendimento.html` for /atendimento* in dev and preview, mirroring the
 * rewrite `vercel.json` applies in production.
 *
 * Without it both local servers fall back to index.html, so the app boots with
 * the SELLER's manifest — the exact divergence that let a manifest bug survive
 * three rounds of local verification while the iPhone kept failing.
 */
function atendimentoDocumentPlugin(): Plugin {
  const rewrite = (req: { url?: string }): void => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    if (path === "/atendimento" || path.startsWith("/atendimento/")) {
      req.url = "/atendimento.html";
    }
  };
  return {
    name: "gallo-atendimento-document",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req);
        next();
      });
    },
  };
}

// SPA estática — sem SSR. Gera `dist/` com `index.html` + assets,
// pronto para a Vercel (ou qualquer host estático) servir como SPA.
export default defineConfig({
  build: {
    rollupOptions: {
      // Two documents, one bundle. The atendimento PWA needs its own HTML
      // because iOS ties a web app's identity to the manifest present when the
      // document loads — swapping `link[rel=manifest]` from a script is never
      // re-evaluated by WebKit, so a shared index.html always offered Safari
      // the seller app. `vercel.json` routes /atendimento* to atendimento.html.
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        atendimento: fileURLToPath(new URL("./atendimento.html", import.meta.url)),
      },
    },
  },
  define: {
    __GIT_BRANCH__: JSON.stringify(resolveGitBranch()),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
    versionManifestPlugin(),
    atendimentoDocumentPlugin(),
  ],
  server: {
    // Bind to IPv4 loopback explicitly. With the default "localhost", Node on
    // Windows may bind ONLY [::1] (IPv6); Chrome's HTTP falls back to IPv6 so
    // the page loads, but the HMR WebSocket does NOT fall back — it dies
    // silently. Without HMR, a dep re-optimization never triggers the
    // full-reload, and the browser mixes two optimize generations (two React
    // copies → "Invalid hook call" / useState null).
    host: "127.0.0.1",
    hmr: {
      host: "127.0.0.1",
    },
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
