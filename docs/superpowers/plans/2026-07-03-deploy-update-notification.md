# Aviso reativo de nova versão (deploy) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avisar reativamente, em runtime, todo usuário logado quando um novo deploy sai — com um card dispensável que minimiza para um selo persistente, recupera o erro de chunk quebrado, e faz hard refresh ao aceitar (encadeando o modal de novidades já existente).

**Architecture:** Um build-id único por build é injetado no bundle (`__BUILD_ID__`) e emitido em `/version.json`. Um watcher PROD-only compara os dois por polling e dispara o card flutuante. Uma rede de segurança (`vite:preloadError` + o error boundary do root) recupera o chunk 404. Tudo 100% frontend, sem backend.

**Tech Stack:** Vite 8 (define + plugin), TanStack Router, React 19, Tailwind v4 + shadcn/ui, Vitest, Iconify.

## Global Constraints

- **Sem novas dependências** — usar só o que já existe (`bunfig.toml` impõe guarda de 24h; nada a adicionar aqui).
- **TypeScript `strict`, sem `any`.** Interfaces de domínio prefixadas com `I`.
- **Naming:** camelCase (vars/fns), PascalCase (componentes/tipos), kebab-case (arquivos).
- **UI/cópia em português do Brasil com acentos corretos** (UTF-8). Comentários em inglês.
- **Tokens semânticos apenas** (`bg-card`, `text-foreground`, `border-border`, `text-info`, `bg-info/10`…). Nunca hex ou `--gallo-*` direto.
- **Ícones via `@/components/Icon`** (Iconify, coleção `mdi:*`).
- **Provider Pattern intacto** — esta feature não toca dados; sem imports de `@/mocks`.
- **Gate de CI:** `bun run build` + `bun run test` verdes. `bunx tsc --noEmit` avaliado por delta nos arquivos novos.
- **Commits:** Conventional Commits em inglês, atômicos. Trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Branch:** `feat/deploy-update-notification` (já criada). Não mergear — integração por PR.

---

### Task 1: Build-id, `version.json` e config de cache

Injeta um build-id único no bundle e o emite como `/version.json`; garante que a Vercel sirva esse arquivo sem cache.

**Files:**
- Modify: `vite.config.ts`
- Modify: `src/vite-env.d.ts:116-117`
- Modify: `vercel.json`

**Interfaces:**
- Produces: constante de build `__BUILD_ID__: string` (global, via `define`); asset estático `/version.json` com shape `{ "buildId": string, "version": string }`.

- [ ] **Step 1: Adicionar cômputo do build-id e o plugin no `vite.config.ts`**

No topo do arquivo, ajustar o import do vite e adicionar o cômputo do build-id logo após a leitura do `pkg`:

```ts
import { defineConfig, type Plugin } from "vite";
```

```ts
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
```

- [ ] **Step 2: Registrar `__BUILD_ID__` no `define` e o plugin em `plugins`**

No objeto `define`, adicionar a constante:

```ts
  define: {
    __GIT_BRANCH__: JSON.stringify(resolveGitBranch()),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
```

No array `plugins`, adicionar `versionManifestPlugin()` ao final:

```ts
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
    versionManifestPlugin(),
  ],
```

- [ ] **Step 3: Declarar o tipo de `__BUILD_ID__` em `src/vite-env.d.ts`**

Substituir o bloco final (linhas ~108-117):

```ts
/**
 * Build-time constants injected by Vite `define` (see vite.config.ts).
 *
 * - `__GIT_BRANCH__` — current git branch, surfaced by the dev-only footer.
 *   Empty string when git is unavailable (e.g. some CI environments).
 * - `__APP_VERSION__` — version field from package.json, used as a fallback
 *   while the CHANGELOG-derived version is still loading.
 * - `__BUILD_ID__` — unique id per build (git sha + timestamp). Injected into
 *   the bundle and mirrored in /version.json; the deploy watcher compares them
 *   at runtime to detect a new production deploy.
 */
declare const __GIT_BRANCH__: string;
declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;
```

- [ ] **Step 4: Servir `/version.json` sem cache no `vercel.json`**

Substituir todo o conteúdo:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/version.json",
      "headers": [{ "key": "Cache-Control", "value": "no-store, max-age=0, must-revalidate" }]
    }
  ]
}
```

- [ ] **Step 5: Build e verificar o `version.json` gerado**

Run: `bun run build`
Expected: build conclui sem erro. Depois:

Run: `cat dist/version.json`
Expected: JSON tipo `{"buildId":"local.1751...","version":"0.130.0"}` (o `buildId` é único por build).

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts src/vite-env.d.ts vercel.json
git commit -m "feat(version-update): emit unique build id + version.json manifest"
```

---

### Task 2: Engine `chunkError` — detectar erro de carregamento de chunk

**Files:**
- Create: `src/features/version-update/engine/chunkError.ts`
- Test: `src/features/version-update/engine/chunkError.test.ts`

**Interfaces:**
- Produces: `isChunkLoadError(error: unknown): boolean`.

- [ ] **Step 1: Escrever o teste que falha**

Create `src/features/version-update/engine/chunkError.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isChunkLoadError } from "./chunkError";

describe("isChunkLoadError", () => {
  const chunkMessages = [
    "Failed to fetch dynamically imported module: https://x/assets/app-CpiVtC6Y.js",
    "error loading dynamically imported module",
    "Importing a module script failed.",
    "Loading chunk 42 failed.",
    'Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".',
  ];

  it.each(chunkMessages)("detects chunk error: %s", (msg) => {
    expect(isChunkLoadError(new Error(msg))).toBe(true);
  });

  it("ignores a generic runtime error", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
  });

  it("ignores an API/network error", () => {
    expect(isChunkLoadError(new Error("Request failed with status code 500"))).toBe(false);
  });

  it("accepts a raw string message", () => {
    expect(isChunkLoadError("Failed to fetch dynamically imported module")).toBe(true);
  });

  it("handles non-error inputs", () => {
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError(42)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun run test -- chunkError`
Expected: FAIL — `Cannot find module "./chunkError"`.

- [ ] **Step 3: Implementar `chunkError.ts`**

Create `src/features/version-update/engine/chunkError.ts`:

```ts
/**
 * True when an error is a failed dynamic-import (lazy chunk) load — the signature
 * of navigating to a route whose chunk was removed by a newer deploy. Matched by
 * message across browsers; the MIME-type variant is what Chrome throws when the
 * SPA rewrite serves index.html in place of the missing .js.
 */
const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk \d+ failed/i,
  /expected a javascript(-or-wasm)? module script/i,
];

export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!message) return false;
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bun run test -- chunkError`
Expected: PASS (todos os casos).

- [ ] **Step 5: Commit**

```bash
git add src/features/version-update/engine/chunkError.ts src/features/version-update/engine/chunkError.test.ts
git commit -m "feat(version-update): add isChunkLoadError engine"
```

---

### Task 3: Engine `deployGate` — decisões puras (deploy, reabertura, guarda anti-loop)

**Files:**
- Create: `src/features/version-update/engine/deployGate.ts`
- Test: `src/features/version-update/engine/deployGate.test.ts`

**Interfaces:**
- Produces:
  - `hasNewDeploy(localBuildId: string, remoteBuildId: string | null): boolean`
  - `shouldReopenPrompt(dismissedAt: number | null, now: number, intervalMs: number): boolean`
  - `shouldAttemptChunkReload(storedBuildId: string | null, currentBuildId: string): boolean`

- [ ] **Step 1: Escrever o teste que falha**

Create `src/features/version-update/engine/deployGate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hasNewDeploy, shouldReopenPrompt, shouldAttemptChunkReload } from "./deployGate";

describe("hasNewDeploy", () => {
  it("false when build ids match", () => expect(hasNewDeploy("a.1", "a.1")).toBe(false));
  it("true when build ids differ", () => expect(hasNewDeploy("a.1", "b.2")).toBe(true));
  it("false when remote is null (no info / fetch failed)", () =>
    expect(hasNewDeploy("a.1", null)).toBe(false));
  it("false when remote is empty", () => expect(hasNewDeploy("a.1", "")).toBe(false));
});

describe("shouldReopenPrompt", () => {
  const INTERVAL = 15 * 60_000;
  it("false when never dismissed", () =>
    expect(shouldReopenPrompt(null, 1_000, INTERVAL)).toBe(false));
  it("false before the interval elapses", () =>
    expect(shouldReopenPrompt(1_000, 1_000 + INTERVAL - 1, INTERVAL)).toBe(false));
  it("true once the interval elapses", () =>
    expect(shouldReopenPrompt(1_000, 1_000 + INTERVAL, INTERVAL)).toBe(true));
});

describe("shouldAttemptChunkReload", () => {
  it("true when no prior attempt this session", () =>
    expect(shouldAttemptChunkReload(null, "a.1")).toBe(true));
  it("true when the stored attempt was a different build", () =>
    expect(shouldAttemptChunkReload("old.0", "a.1")).toBe(true));
  it("false when we already reloaded for this exact build (loop guard)", () =>
    expect(shouldAttemptChunkReload("a.1", "a.1")).toBe(false));
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun run test -- deployGate`
Expected: FAIL — `Cannot find module "./deployGate"`.

- [ ] **Step 3: Implementar `deployGate.ts`**

Create `src/features/version-update/engine/deployGate.ts`:

```ts
/** A newer deploy is live when the remote build id is known and differs from ours. */
export function hasNewDeploy(localBuildId: string, remoteBuildId: string | null): boolean {
  if (!remoteBuildId) return false;
  return remoteBuildId !== localBuildId;
}

/** After the user dismisses the card, reopen it once the snooze window elapses. */
export function shouldReopenPrompt(
  dismissedAt: number | null,
  now: number,
  intervalMs: number,
): boolean {
  if (dismissedAt === null) return false;
  return now - dismissedAt >= intervalMs;
}

/**
 * Loop guard for the chunk-error auto-reload: only attempt a reload if we have
 * NOT already reloaded for this exact build. After a successful reload the build
 * id changes, so the stored value stops matching and the guard self-clears.
 */
export function shouldAttemptChunkReload(
  storedBuildId: string | null,
  currentBuildId: string,
): boolean {
  return storedBuildId !== currentBuildId;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bun run test -- deployGate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/version-update/engine/deployGate.ts src/features/version-update/engine/deployGate.test.ts
git commit -m "feat(version-update): add deployGate pure decisions"
```

---

### Task 4: `lib/buildId` — ler o build local e buscar/parsear o remoto

**Files:**
- Create: `src/features/version-update/lib/buildId.ts`
- Test: `src/features/version-update/lib/buildId.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `getLocalBuildId(): string`
  - `parseVersionJson(text: string): string | null`
  - `fetchRemoteBuildId(signal?: AbortSignal): Promise<string | null>`

- [ ] **Step 1: Escrever o teste que falha (parse puro)**

Create `src/features/version-update/lib/buildId.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseVersionJson } from "./buildId";

describe("parseVersionJson", () => {
  it("extracts a non-empty buildId", () => {
    expect(parseVersionJson('{"buildId":"a.1","version":"0.1.0"}')).toBe("a.1");
  });
  it("returns null when buildId is missing", () => {
    expect(parseVersionJson('{"version":"0.1.0"}')).toBe(null);
  });
  it("returns null when buildId is empty", () => {
    expect(parseVersionJson('{"buildId":""}')).toBe(null);
  });
  it("returns null on non-JSON (e.g. the SPA index.html fallback)", () => {
    expect(parseVersionJson("<!doctype html><html></html>")).toBe(null);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun run test -- buildId`
Expected: FAIL — `Cannot find module "./buildId"`.

- [ ] **Step 3: Implementar `buildId.ts`**

Create `src/features/version-update/lib/buildId.ts`:

```ts
/** The build id compiled into this bundle. Guarded for envs without the define. */
export function getLocalBuildId(): string {
  return typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";
}

/** Extracts a valid buildId from the raw /version.json body, or null. */
export function parseVersionJson(text: string): string | null {
  try {
    const data = JSON.parse(text) as { buildId?: unknown };
    return typeof data.buildId === "string" && data.buildId.length > 0 ? data.buildId : null;
  } catch {
    return null;
  }
}

/**
 * Reads the build id currently live in production. Fail-open: any failure
 * (offline, 404 in dev, non-JSON, aborted) resolves to null so the caller never
 * raises a false positive and never throws.
 */
export async function fetchRemoteBuildId(signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch("/version.json", { cache: "no-store", signal });
    if (!res.ok) return null;
    return parseVersionJson(await res.text());
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bun run test -- buildId`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/version-update/lib/buildId.ts src/features/version-update/lib/buildId.test.ts
git commit -m "feat(version-update): add buildId local/remote helpers"
```

---

### Task 5: `lib/hardReload` — hard refresh + reload guardado contra loop

**Files:**
- Create: `src/features/version-update/lib/hardReload.ts`

**Interfaces:**
- Consumes: `getLocalBuildId` (Task 4), `shouldAttemptChunkReload` (Task 3).
- Produces:
  - `hardReload(): Promise<void>`
  - `canGuardedChunkReload(): boolean`
  - `commitGuardedChunkReload(): void`
  - `attemptGuardedChunkReload(): boolean`

- [ ] **Step 1: Implementar `hardReload.ts`**

Create `src/features/version-update/lib/hardReload.ts`:

```ts
import { shouldAttemptChunkReload } from "../engine/deployGate";
import { getLocalBuildId } from "./buildId";

/** sessionStorage key holding the build id of the last chunk-error auto-reload. */
const CHUNK_RELOAD_GUARD_KEY = "gallo-chunk-reload-attempt";

/**
 * Clears the Cache Storage (removes orphaned chunks cached by the static SW) and
 * reloads. The SW never caches navigation/HTML, so the reload always fetches a
 * fresh index.html pointing at the new hashed chunks. `location.reload(true)` is
 * obsolete/ignored — clearing caches + a normal reload is the practical
 * equivalent (every asset is content-hashed).
 */
export async function hardReload(): Promise<void> {
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Cache clearing is best-effort — never block the reload.
  }
  window.location.reload();
}

/** True unless we already auto-reloaded for this exact build (loop guard). */
export function canGuardedChunkReload(): boolean {
  try {
    const stored = sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY);
    return shouldAttemptChunkReload(stored, getLocalBuildId());
  } catch {
    // sessionStorage unavailable → allow a single attempt.
    return true;
  }
}

/** Records this build as "attempted" then hard-reloads. */
export function commitGuardedChunkReload(): void {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, getLocalBuildId());
  } catch {
    // ignore — proceed with the reload regardless.
  }
  void hardReload();
}

/**
 * Reloads onto the new build unless the guard already fired for this build.
 * Returns true if a reload was triggered, false if the caller should surface a
 * manual action instead.
 */
export function attemptGuardedChunkReload(): boolean {
  if (!canGuardedChunkReload()) return false;
  commitGuardedChunkReload();
  return true;
}
```

- [ ] **Step 2: Type-check dos arquivos novos**

Run: `bunx tsc --noEmit 2>&1 | grep "version-update" || echo "no new type errors"`
Expected: `no new type errors` (o baseline pré-existente do `tsc` é ignorado; avaliamos por delta).

- [ ] **Step 3: Commit**

```bash
git add src/features/version-update/lib/hardReload.ts
git commit -m "feat(version-update): add hardReload + loop-guarded chunk reload"
```

---

### Task 6: `preloadErrorHandler` + barrel + wiring no `main.tsx`

Captura o `vite:preloadError` (mecanismo oficial do Vite) e recupera antes de o erro virar tela.

**Files:**
- Create: `src/features/version-update/preloadErrorHandler.ts`
- Create: `src/features/version-update/index.ts`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `attemptGuardedChunkReload` (Task 5).
- Produces: `initPreloadErrorHandler(): void` (exportado pelo barrel `@/features/version-update`).

- [ ] **Step 1: Implementar `preloadErrorHandler.ts`**

Create `src/features/version-update/preloadErrorHandler.ts`:

```ts
import { attemptGuardedChunkReload } from "./lib/hardReload";

/**
 * Registers a listener for Vite's `vite:preloadError`, fired when a dynamic
 * import (lazy route chunk) fails to load — typically because a newer deploy
 * removed the old chunk. Calling preventDefault stops Vite from throwing; we
 * recover by reloading onto the new build (loop-guarded). Call once at startup.
 */
export function initPreloadErrorHandler(): void {
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    attemptGuardedChunkReload();
  });
}
```

- [ ] **Step 2: Criar o barrel `index.ts`**

Create `src/features/version-update/index.ts`:

```ts
export { initPreloadErrorHandler } from "./preloadErrorHandler";
```

- [ ] **Step 3: Chamar `initPreloadErrorHandler()` no `main.tsx`**

Em `src/main.tsx`, adicionar o import junto aos outros e a chamada logo após `initObservability()`:

```ts
import { initObservability } from "@/shared/lib/observability";
import { initPreloadErrorHandler } from "@/features/version-update";
```

```ts
// PRD-110: error tracking boots before the first render so early crashes are
// captured. No-op (zero overhead) when VITE_SENTRY_DSN is not configured.
initObservability();

// Recover a failed lazy-chunk load (removed by a newer deploy) by reloading onto
// the new build instead of throwing — see src/features/version-update.
initPreloadErrorHandler();
```

- [ ] **Step 4: Build para verificar o wiring**

Run: `bun run build`
Expected: build conclui sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/features/version-update/preloadErrorHandler.ts src/features/version-update/index.ts src/main.tsx
git commit -m "feat(version-update): recover vite:preloadError via guarded reload"
```

---

### Task 7: `i18n` + `ChunkErrorScreen` + error boundary do root

Troca "Algo deu errado" por "Nova versão disponível" **apenas** para chunk-load-error.

**Files:**
- Create: `src/features/version-update/i18n/pt-BR.ts`
- Create: `src/features/version-update/components/ChunkErrorScreen.tsx`
- Modify: `src/features/version-update/index.ts`
- Modify: `src/routes/__root.tsx:34-65`

**Interfaces:**
- Consumes: `canGuardedChunkReload`, `commitGuardedChunkReload`, `hardReload` (Task 5); `isChunkLoadError` (Task 2).
- Produces: `VERSION_UPDATE_I18N`; `ChunkErrorScreen(): JSX.Element`; barrel re-exporta `ChunkErrorScreen` e `isChunkLoadError`.

- [ ] **Step 1: Criar `i18n/pt-BR.ts`**

Create `src/features/version-update/i18n/pt-BR.ts`:

```ts
/** User-facing copy for the version-update surfaces (Brazilian Portuguese). */
export const VERSION_UPDATE_I18N = {
  prompt: {
    title: "Atualização disponível",
    body: "Uma nova versão da plataforma está pronta. Atualize quando puder para aplicar as melhorias.",
    accept: "Atualizar agora",
    dismiss: "Agora não",
    badgeLabel: "Atualização pronta",
    badgeAria: "Atualização disponível — toque para atualizar",
  },
  chunkError: {
    title: "Nova versão disponível",
    body: "A plataforma foi atualizada. Recarregue para continuar de onde parou.",
    accept: "Atualizar agora",
    autoReloading: "Recarregando automaticamente…",
  },
} as const;
```

- [ ] **Step 2: Criar `ChunkErrorScreen.tsx`**

Create `src/features/version-update/components/ChunkErrorScreen.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { canGuardedChunkReload, commitGuardedChunkReload, hardReload } from "../lib/hardReload";
import { VERSION_UPDATE_I18N } from "../i18n/pt-BR";

/** Short pause so the message is visible and error reporting flushes before reload. */
const AUTO_RELOAD_DELAY_MS = 3000;

/**
 * Shown by the root error boundary when a lazy chunk failed to load (a newer
 * deploy removed it). Auto-reloads onto the new build after a short delay unless
 * the loop guard already fired for this build — in which case it offers a manual
 * button only (the reload did not fix it, so we don't loop).
 */
export function ChunkErrorScreen() {
  const i18n = VERSION_UPDATE_I18N.chunkError;
  const [autoReloading] = useState(() => canGuardedChunkReload());

  useEffect(() => {
    if (!autoReloading) return;
    const timer = setTimeout(() => commitGuardedChunkReload(), AUTO_RELOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [autoReloading]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-info/10">
          <Icon icon="mdi:rocket-launch-outline" size={24} className="text-info" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{i18n.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{i18n.body}</p>
        <div className="mt-6">
          <button
            onClick={() => void hardReload()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {i18n.accept}
          </button>
        </div>
        {autoReloading && (
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon icon="mdi:reload" size={14} className="animate-spin motion-reduce:hidden" />
            {i18n.autoReloading}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Re-exportar no barrel `index.ts`**

Substituir o conteúdo de `src/features/version-update/index.ts`:

```ts
export { initPreloadErrorHandler } from "./preloadErrorHandler";
export { isChunkLoadError } from "./engine/chunkError";
export { ChunkErrorScreen } from "./components/ChunkErrorScreen";
```

- [ ] **Step 4: Usar o screen no `ErrorComponent` do root**

Em `src/routes/__root.tsx`, adicionar o import no topo (junto aos demais):

```ts
import { isChunkLoadError, ChunkErrorScreen } from "@/features/version-update";
```

Adicionar, logo após `const router = useRouter();` dentro de `ErrorComponent`, o desvio para chunk error (antes do `return` genérico existente):

```ts
function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  if (isChunkLoadError(error)) {
    return <ChunkErrorScreen />;
  }

  return (
    // ...tela genérica "Algo deu errado" existente, inalterada...
  );
}
```

- [ ] **Step 5: Build para verificar**

Run: `bun run build`
Expected: build conclui sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/features/version-update/i18n/pt-BR.ts src/features/version-update/components/ChunkErrorScreen.tsx src/features/version-update/index.ts src/routes/__root.tsx
git commit -m "feat(version-update): chunk-error recovery screen in root boundary"
```

---

### Task 8: `useDeployWatcher` — polling PROD-only do build remoto

**Files:**
- Create: `src/features/version-update/hooks/useDeployWatcher.ts`

**Interfaces:**
- Consumes: `fetchRemoteBuildId`, `getLocalBuildId` (Task 4); `hasNewDeploy` (Task 3).
- Produces: `useDeployWatcher(): { updateReady: boolean }`.

- [ ] **Step 1: Implementar `useDeployWatcher.ts`**

Create `src/features/version-update/hooks/useDeployWatcher.ts`:

```ts
import { useEffect, useRef, useState } from "react";
import { fetchRemoteBuildId, getLocalBuildId } from "../lib/buildId";
import { hasNewDeploy } from "../engine/deployGate";

const POLL_INTERVAL_MS = 60_000;

export interface DeployWatcherResult {
  updateReady: boolean;
}

/**
 * Polls /version.json (production only) and flips `updateReady` to true once the
 * live build id differs from the one this bundle was built with. Checks on an
 * interval and whenever the tab regains focus/visibility (covers a tab left open
 * across several deploys). Stops polling once an update is detected. Fail-open:
 * a failed fetch is ignored and never raises a false positive.
 */
export function useDeployWatcher(): DeployWatcherResult {
  const [updateReady, setUpdateReady] = useState(false);
  const readyRef = useRef(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;

    const localBuildId = getLocalBuildId();
    const controller = new AbortController();
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const check = async () => {
      if (readyRef.current) return;
      const remote = await fetchRemoteBuildId(controller.signal);
      if (hasNewDeploy(localBuildId, remote)) {
        readyRef.current = true;
        setUpdateReady(true);
        if (intervalId) clearInterval(intervalId);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };

    intervalId = setInterval(() => void check(), POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    void check();

    return () => {
      controller.abort();
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return { updateReady };
}
```

- [ ] **Step 2: Type-check dos arquivos novos**

Run: `bunx tsc --noEmit 2>&1 | grep "useDeployWatcher" || echo "no new type errors"`
Expected: `no new type errors`.

- [ ] **Step 3: Commit**

```bash
git add src/features/version-update/hooks/useDeployWatcher.ts
git commit -m "feat(version-update): add useDeployWatcher polling hook"
```

---

### Task 9: `VersionUpdatePrompt` — card flutuante + selo, montado no `AppLayout`

**Files:**
- Create: `src/features/version-update/components/VersionUpdatePrompt.tsx`
- Modify: `src/features/version-update/index.ts`
- Modify: `src/features/shell/layouts/AppLayout.tsx`

**Interfaces:**
- Consumes: `useDeployWatcher` (Task 8); `hardReload` (Task 5); `shouldReopenPrompt` (Task 3); `VERSION_UPDATE_I18N` (Task 7).
- Produces: `VersionUpdatePrompt(): JSX.Element | null` (exportado pelo barrel).

- [ ] **Step 1: Implementar `VersionUpdatePrompt.tsx`**

Create `src/features/version-update/components/VersionUpdatePrompt.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useDeployWatcher } from "../hooks/useDeployWatcher";
import { hardReload } from "../lib/hardReload";
import { shouldReopenPrompt } from "../engine/deployGate";
import { VERSION_UPDATE_I18N } from "../i18n/pt-BR";

/** How long the card stays minimized before it reopens itself. */
const REOPEN_INTERVAL_MS = 15 * 60_000;
/** How often we check whether the snooze window has elapsed. */
const REOPEN_TICK_MS = 30_000;

/**
 * Floating "new version available" prompt. Renders nothing until the deploy
 * watcher flags an update. Dismissible: "Agora não" minimizes it to a persistent
 * badge (never disappears) and the card reopens itself after REOPEN_INTERVAL_MS.
 * "Atualizar agora" hard-reloads onto the new build.
 */
export function VersionUpdatePrompt() {
  const { updateReady } = useDeployWatcher();
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const i18n = VERSION_UPDATE_I18N.prompt;

  useEffect(() => {
    if (!updateReady || dismissedAt === null) return;
    const id = setInterval(() => {
      if (shouldReopenPrompt(dismissedAt, Date.now(), REOPEN_INTERVAL_MS)) {
        setDismissedAt(null);
      }
    }, REOPEN_TICK_MS);
    return () => clearInterval(id);
  }, [updateReady, dismissedAt]);

  if (!updateReady) return null;

  if (dismissedAt !== null) {
    return (
      <button
        type="button"
        onClick={() => setDismissedAt(null)}
        aria-label={i18n.badgeAria}
        className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-lg outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="relative flex h-2.5 w-2.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info/60 motion-reduce:hidden" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-info" />
        </span>
        {i18n.badgeLabel}
      </button>
    );
  }

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 w-[320px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-4 shadow-xl"
    >
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info/10">
          <Icon icon="mdi:rocket-launch-outline" size={20} className="text-info" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{i18n.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{i18n.body}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => void hardReload()}>
          {i18n.accept}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDismissedAt(Date.now())}>
          {i18n.dismiss}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Re-exportar no barrel `index.ts`**

Substituir o conteúdo de `src/features/version-update/index.ts`:

```ts
export { initPreloadErrorHandler } from "./preloadErrorHandler";
export { isChunkLoadError } from "./engine/chunkError";
export { ChunkErrorScreen } from "./components/ChunkErrorScreen";
export { VersionUpdatePrompt } from "./components/VersionUpdatePrompt";
```

- [ ] **Step 3: Montar `<VersionUpdatePrompt />` no `AppLayout`**

Em `src/features/shell/layouts/AppLayout.tsx`, adicionar o import junto aos demais de feature:

```ts
import { VersionUpdatePrompt } from "@/features/version-update";
```

E montar junto dos outros guards (logo após `<WhatsNewModal />`):

```tsx
        <UrgentBroadcastClaim />
        <WhatsNewModal />
        <VersionUpdatePrompt />
      </div>
```

- [ ] **Step 4: Build + testes completos**

Run: `bun run build`
Expected: build conclui sem erro.

Run: `bun run test`
Expected: PASS — inclui `chunkError`, `deployGate`, `buildId` (nenhuma regressão na suíte).

- [ ] **Step 5: Commit**

```bash
git add src/features/version-update/components/VersionUpdatePrompt.tsx src/features/version-update/index.ts src/features/shell/layouts/AppLayout.tsx
git commit -m "feat(version-update): floating update prompt with minimized badge"
```

---

## Verificação final (após a última task)

- [ ] `bun run build` verde e `dist/version.json` presente com `buildId` único.
- [ ] `bun run test` verde (3 arquivos de engine/lib testados).
- [ ] `bunx tsc --noEmit` sem **novos** erros nos arquivos de `src/features/version-update/**` e nos arquivos tocados (`__root.tsx`, `main.tsx`, `AppLayout.tsx`).
- [ ] Revisão manual do dono (a UI é validada manualmente): simular deploy trocando o `buildId` de `dist/version.json` no preview e confirmar o card; forçar um chunk 404 e confirmar a tela de recuperação.

## Notas de rollout

- **Nenhuma migration / Edge Function / dependência nova.** PR único.
- **Primeiro deploy** que introduz a feature não avisa quem já está no build anterior (não tem o watcher); passa a valer do deploy seguinte em diante — intrínseco.
- **Validar na Vercel:** após o deploy, `curl -I https://crm.gallobasediesel.com.br/version.json` deve devolver `200` com `Cache-Control: no-store` e corpo JSON (não o `index.html`).
- **Version bump:** a feature é `feat` — bump MINOR com codinome novo no fechamento do PRD/PR, seguindo o fluxo do projeto.

## Divergências deliberadas do mockup

- A tela de recuperação de chunk faz **reload guardado imediato (~3s)**, não um contador de 5s. Motivo: evita timer arbitrário e é à prova de loop (a guarda por build-id decide auto vs manual). Cópia sem número para não mentir o tempo.
