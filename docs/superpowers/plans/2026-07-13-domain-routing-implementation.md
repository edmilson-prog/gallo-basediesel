# Rotas dedicadas por domínio/subdomínio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer `loja.*`, `portal.*` e `pwa.gallobasediesel.com.br` exibirem URLs limpas (sem o prefixo de arquivo `/loja`, `/portal`, `/pwa` na barra de endereço), casando internamente com as rotas de arquivo já existentes — sem tocar em nenhum dos ~150 arquivos de rota.

**Architecture:** `TanStack Router` aceita um `history` customizado. Construímos um via `createBrowserHistory({ parseLocation, createHref })` (de `@tanstack/react-router`, que reexporta `@tanstack/history`): `parseLocation` lê o pathname real do navegador e **acrescenta** o prefixo do host antes de entregar ao router (o router então casa com o arquivo de rota existente); `createHref` remove esse prefixo antes de escrever a URL visível. Hosts sem mapeamento (localhost, `*.vercel.app`, `crm.gallobasediesel.com.br`) resolvem prefixo vazio — comportamento 100% inalterado.

**Tech Stack:** TypeScript, `@tanstack/react-router` (já instalado), `@tanstack/history` (dependência nova — hoje só transitiva), Vitest.

**Spec de referência:** `docs/superpowers/specs/2026-07-12-domain-routing-design.md` (já commitado, aprovado).

## Global Constraints

- Nenhuma mudança em arquivos de rota existentes (`pwa.*.tsx`, `portal.*.tsx`, `loja.*.tsx`, `app.*.tsx`, `auth.*.tsx`) — são ~150 arquivos, fora de escopo.
- `vercel.json` permanece inalterado (o rewrite genérico `/(.*) → /index.html` já cobre todos os hosts).
- Sem migration, sem Edge Function, sem mudança de schema/RLS — isso é 100% frontend.
- Hosts não listados no mapa host→prefixo (localhost, `*.vercel.app`, `crm.gallobasediesel.com.br`) devem resolver prefixo vazio — comportamento atual, sem regressão.
- TypeScript `strict: true`; evitar `any` (uma exceção pontual e documentada é aceitável para o tipo de `window` injetável em teste — ver Task 3).
- Comentários em inglês (CLAUDE.md); nenhuma string de usuário nova nesta entrega.
- Suite de testes é Vitest, ambiente `node` (sem DOM global — `vitest.config.ts:8`). Qualquer teste que precise de um `window` precisa injetar um fake, não pode depender de jsdom.

---

### Task 1: `getHostPrefix` — tabela host → prefixo

**Files:**
- Create: `src/shared/lib/hostRouting.ts`
- Test: `src/shared/lib/hostRouting.test.ts`

**Interfaces:**
- Produces: `getHostPrefix(hostname: string): string`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/shared/lib/hostRouting.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getHostPrefix } from "./hostRouting";

describe("getHostPrefix", () => {
  it("maps the three dedicated subdomains to their route prefix", () => {
    expect(getHostPrefix("pwa.gallobasediesel.com.br")).toBe("/pwa");
    expect(getHostPrefix("portal.gallobasediesel.com.br")).toBe("/portal");
    expect(getHostPrefix("loja.gallobasediesel.com.br")).toBe("/loja");
  });

  it("resolves unmapped hosts to an empty prefix", () => {
    expect(getHostPrefix("crm.gallobasediesel.com.br")).toBe("");
    expect(getHostPrefix("localhost")).toBe("");
    expect(getHostPrefix("gallo-basediesel-git-feat.vercel.app")).toBe("");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test hostRouting`
Expected: FAIL — `Cannot find module './hostRouting'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementação mínima**

Criar `src/shared/lib/hostRouting.ts`:

```ts
/**
 * Static host → route-prefix mapping (design:
 * docs/superpowers/specs/2026-07-12-domain-routing-design.md).
 *
 * Hosts not listed here (localhost, *.vercel.app previews, the CRM's own
 * crm.gallobasediesel.com.br) resolve to an empty prefix — today's behavior,
 * unchanged.
 */
const HOST_PREFIXES: Record<string, string> = {
  "pwa.gallobasediesel.com.br": "/pwa",
  "portal.gallobasediesel.com.br": "/portal",
  "loja.gallobasediesel.com.br": "/loja",
};

export function getHostPrefix(hostname: string): string {
  return HOST_PREFIXES[hostname] ?? "";
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test hostRouting`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/hostRouting.ts src/shared/lib/hostRouting.test.ts
git commit -m "feat: add host-to-prefix mapping for dedicated subdomains"
```

---

### Task 2: `applyHostPrefix` / `stripHostPrefix` — helpers puros de string

**Files:**
- Modify: `src/shared/lib/hostRouting.ts`
- Modify: `src/shared/lib/hostRouting.test.ts`

**Interfaces:**
- Consumes: nada do Task 1 diretamente (funções independentes, mas vivem no mesmo módulo).
- Produces: `applyHostPrefix(prefix: string, pathname: string): string`, `stripHostPrefix(prefix: string, href: string): string`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `src/shared/lib/hostRouting.test.ts`:

```ts
import { applyHostPrefix, stripHostPrefix } from "./hostRouting";

describe("applyHostPrefix", () => {
  it("prepends the prefix to the pathname", () => {
    expect(applyHostPrefix("/loja", "/")).toBe("/loja/");
    expect(applyHostPrefix("/loja", "/carrinho")).toBe("/loja/carrinho");
  });

  it("is a no-op for an empty prefix", () => {
    expect(applyHostPrefix("", "/app/clientes")).toBe("/app/clientes");
  });
});

describe("stripHostPrefix", () => {
  it("removes a leading prefix, falling back to / when nothing is left", () => {
    expect(stripHostPrefix("/loja", "/loja/carrinho")).toBe("/carrinho");
    expect(stripHostPrefix("/loja", "/loja")).toBe("/");
    expect(stripHostPrefix("/loja", "/loja/carrinho?cupom=X")).toBe("/carrinho?cupom=X");
  });

  it("is a no-op for an empty prefix or a href that doesn't start with it", () => {
    expect(stripHostPrefix("", "/app/clientes/123")).toBe("/app/clientes/123");
    expect(stripHostPrefix("/loja", "/app/clientes")).toBe("/app/clientes");
  });
});
```

(Ajustar o import no topo do arquivo para `import { applyHostPrefix, getHostPrefix, stripHostPrefix } from "./hostRouting";` numa linha só, em vez de dois imports separados.)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun run test hostRouting`
Expected: FAIL — `applyHostPrefix`/`stripHostPrefix` não exportados ainda.

- [ ] **Step 3: Implementação mínima**

Adicionar em `src/shared/lib/hostRouting.ts`, depois de `getHostPrefix`:

```ts
export function applyHostPrefix(prefix: string, pathname: string): string {
  if (!prefix) return pathname;
  return `${prefix}${pathname}`;
}

export function stripHostPrefix(prefix: string, href: string): string {
  if (!prefix || !href.startsWith(prefix)) return href;
  const stripped = href.slice(prefix.length);
  return stripped === "" ? "/" : stripped;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun run test hostRouting`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/hostRouting.ts src/shared/lib/hostRouting.test.ts
git commit -m "feat: add pure prefix apply/strip helpers for host routing"
```

---

### Task 3: `createPrefixedBrowserHistory` — wiring com `@tanstack/history`

**Files:**
- Modify: `package.json` (nova dependência direta)
- Modify: `src/shared/lib/hostRouting.ts`
- Modify: `src/shared/lib/hostRouting.test.ts`

**Interfaces:**
- Consumes: `getHostPrefix`, `applyHostPrefix`, `stripHostPrefix` (Tasks 1-2); `createBrowserHistory` de `@tanstack/react-router`; `parseHref` de `@tanstack/history`.
- Produces: `createPrefixedBrowserHistory(opts: { hostname: string; window?: typeof window }): RouterHistory`

- [ ] **Step 1: Adicionar a dependência**

`@tanstack/history` já é uma dependência transitiva de `@tanstack/react-router` (resolvida em `bun.lock` na versão `1.162.0`), mas ainda não é declarada diretamente — vamos importar `parseHref` dela, então precisa entrar como dependência direta.

Run: `bun add @tanstack/history@1.162.0`
Expected: `package.json` ganha a linha `"@tanstack/history": "^1.162.0",` (ordem alfabética, antes de `"@tanstack/react-query"` — linha 58 hoje) e `bun.lock` não muda a resolução (já era essa versão).

Confirmar:
Run: `grep -n '"@tanstack/history"' package.json bun.lock`
Expected: aparece em ambos, mesma versão `1.162.0`.

- [ ] **Step 2: Escrever o teste que falha**

Adicionar ao final de `src/shared/lib/hostRouting.test.ts` (e importar `createPrefixedBrowserHistory` junto dos demais no topo):

```ts
interface FakeWindow {
  location: { hostname: string; pathname: string; search: string; hash: string };
  history: {
    state: unknown;
    length: number;
    pushState: (state: unknown, title: string, href?: string) => void;
    replaceState: (state: unknown, title: string, href?: string) => void;
    back: () => void;
    forward: () => void;
    go: (n: number) => void;
  };
  addEventListener: (type: string, cb: (event: unknown) => void) => void;
  removeEventListener: (type: string, cb: (event: unknown) => void) => void;
}

function createFakeWindow(initialPathname: string, hostname: string) {
  const calls: Array<{ method: "pushState" | "replaceState"; href?: string }> = [];
  const fakeWindow: FakeWindow = {
    location: { hostname, pathname: initialPathname, search: "", hash: "" },
    history: {
      state: null,
      length: 1,
      pushState(state, _title, href) {
        this.state = state;
        if (typeof href === "string") fakeWindow.location.pathname = href.split("?")[0]!.split("#")[0]!;
        calls.push({ method: "pushState", href });
      },
      replaceState(state, _title, href) {
        this.state = state;
        if (typeof href === "string") fakeWindow.location.pathname = href.split("?")[0]!.split("#")[0]!;
        calls.push({ method: "replaceState", href });
      },
      back() {},
      forward() {},
      go() {},
    },
    addEventListener() {},
    removeEventListener() {},
  };
  return { fakeWindow, calls };
}

describe("createPrefixedBrowserHistory", () => {
  it("matches host-prefixed paths internally but writes a clean href to the browser", () => {
    const { fakeWindow, calls } = createFakeWindow("/", "loja.gallobasediesel.com.br");

    const history = createPrefixedBrowserHistory({
      hostname: fakeWindow.location.hostname,
      window: fakeWindow as unknown as typeof window,
    });

    expect(history.location.pathname).toBe("/loja/");

    history.push("/loja/carrinho", {});
    history.flush();

    expect(calls.at(-1)).toEqual({ method: "pushState", href: "/carrinho" });
    expect(history.location.pathname).toBe("/loja/carrinho");
  });

  it("is a no-op end to end for a host with no mapped prefix (e.g. crm)", () => {
    const { fakeWindow, calls } = createFakeWindow("/app/clientes", "crm.gallobasediesel.com.br");

    const history = createPrefixedBrowserHistory({
      hostname: fakeWindow.location.hostname,
      window: fakeWindow as unknown as typeof window,
    });

    expect(history.location.pathname).toBe("/app/clientes");

    history.push("/app/clientes/123", {});
    history.flush();

    expect(calls.at(-1)).toEqual({ method: "pushState", href: "/app/clientes/123" });
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `bun run test hostRouting`
Expected: FAIL — `createPrefixedBrowserHistory` não exportado ainda.

- [ ] **Step 4: Implementação mínima**

No topo de `src/shared/lib/hostRouting.ts`, adicionar os imports:

```ts
import { createBrowserHistory, type RouterHistory } from "@tanstack/react-router";
import { parseHref } from "@tanstack/history";
```

E no final do arquivo:

```ts
interface CreatePrefixedBrowserHistoryOptions {
  hostname: string;
  /** Injectable for tests; defaults to the real `window`. */
  window?: typeof window;
}

/**
 * Wraps TanStack Router's createBrowserHistory so the router internally
 * matches host-prefixed paths (e.g. /loja/carrinho on
 * loja.gallobasediesel.com.br) while the visible address bar stays clean
 * (/carrinho) — see the design doc's "History virtual" section.
 */
export function createPrefixedBrowserHistory(
  opts: CreatePrefixedBrowserHistoryOptions,
): RouterHistory {
  const prefix = getHostPrefix(opts.hostname);
  const win = opts.window ?? window;

  return createBrowserHistory({
    window: win,
    parseLocation: () =>
      parseHref(
        `${applyHostPrefix(prefix, win.location.pathname)}${win.location.search}${win.location.hash}`,
        win.history.state,
      ),
    createHref: (href) => stripHostPrefix(prefix, href),
  });
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `bun run test hostRouting`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock src/shared/lib/hostRouting.ts src/shared/lib/hostRouting.test.ts
git commit -m "feat: wire a prefix-aware browser history via @tanstack/history"
```

---

### Task 4: Injetar o `history` customizado no router

**Files:**
- Modify: `src/router.tsx`

**Interfaces:**
- Consumes: `createPrefixedBrowserHistory` (Task 3).

- [ ] **Step 1: Editar `src/router.tsx`**

Conteúdo atual:

```tsx
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
```

Novo conteúdo:

```tsx
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { createPrefixedBrowserHistory } from "@/shared/lib/hostRouting";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    history: createPrefixedBrowserHistory({ hostname: window.location.hostname }),
  });

  return router;
};
```

(`getRouter()` só é chamado em `src/main.tsx`, direto no boot do app no navegador — `window` está sempre disponível ali, sem necessidade de guard.)

- [ ] **Step 2: Rodar a suíte inteira**

Run: `bun run test`
Expected: PASS — todos os testes existentes continuam passando (nenhum outro arquivo depende da forma como `getRouter` monta o `history`).

- [ ] **Step 3: Conferir que o build não quebra**

Run: `bun run build`
Expected: build termina sem erro (o `bun run build` do Vite não faz type-check completo — é o gate prático de CI deste projeto, per CLAUDE.md).

- [ ] **Step 4: Commit**

```bash
git add src/router.tsx
git commit -m "feat: route dedicated subdomains through a prefix-aware history"
```

---

### Task 5: Auditoria de navegação hardcoded fora do router

**Files:** nenhum (verificação — só gera mudança se algo for encontrado).

O design (seção 6 do spec) apontava como risco: `window.location.href = "/pwa/algo"` ou `<a href="/portal/...">` cru vazariam o prefixo, já que não passam pelo `createHref` customizado. Uma auditoria já foi feita durante o planejamento — os 2 achados no código-fonte são:

- `src/features/shipping/pages/ShippingConfigPage.tsx:911` — `window.location.href = url` onde `url` vem de `getMelhorEnvioAuthorizeUrl(...)` (URL **externa** de autorização OAuth do Melhor Envio, não um path interno). Não afetado.
- `src/features/shipping/pages/ShippingConfigPage.tsx:1016` — `<a href="/app/configuracoes/chaves">` — aponta pra uma rota do CRM (`/app/...`), host que **não tem prefixo mapeado** (`crm.gallobasediesel.com.br` → `""`). Não afetado.

- [ ] **Step 1: Reconfirmar a auditoria**

Run: `grep -rn 'window\.location\.\(href\|assign\|replace\)\s*=' src`
Expected: só o resultado de `ShippingConfigPage.tsx:911`, já analisado acima.

Run: `grep -rn 'href=["'"'"'\`]/\(pwa\|portal\|loja\|app\|auth\)' src`
Expected: só o resultado de `ShippingConfigPage.tsx:1016`, já analisado acima.

- [ ] **Step 2: Se o grep trouxer algo NOVO** (não estava na lista acima)

Abrir o arquivo, confirmar se é um path interno de `/pwa`, `/portal` ou `/loja` apontado via navegação fora do router. Se for, trocar por `<Link to="...">` do TanStack Router (que já passa pelo `createHref` customizado) ou, se não for viável usar `<Link>` naquele ponto, montar a URL absoluta com `window.location.origin` preservado (nunca hardcoded).

- [ ] **Step 3: Commit** (só se o Step 2 tiver mudado algo)

```bash
git add <arquivo(s) alterado(s)>
git commit -m "fix: route internal navigation through the router's prefix-aware history"
```

---

### Task 6: Verificação manual em navegador real (hosts file)

**Manual — requer o usuário, não é executável por subagente.** O comportamento é 100% client-side (depende do hostname real resolvido pelo navegador); `bun run dev`/`bun run test` sozinhos não validam isso — é exatamente o risco já sinalizado na seção 6 do spec.

- [ ] **Step 1: Whitelist temporário no Vite**

Vite 8 bloqueia por padrão requisições com um `Host` header não reconhecido (`server.allowedHosts`/`preview.allowedHosts`). Editar `vite.config.ts` **temporariamente** (não commitar) adicionando, no objeto passado a `defineConfig`:

```ts
  preview: {
    allowedHosts: [
      "crm.gallobasediesel.com.br",
      "loja.gallobasediesel.com.br",
      "portal.gallobasediesel.com.br",
      "pwa.gallobasediesel.com.br",
    ],
  },
```

- [ ] **Step 2: Mapear os hosts pro localhost**

Editar (como Administrador) `C:\Windows\System32\drivers\etc\hosts`, adicionando:

```
127.0.0.1 crm.gallobasediesel.com.br
127.0.0.1 loja.gallobasediesel.com.br
127.0.0.1 portal.gallobasediesel.com.br
127.0.0.1 pwa.gallobasediesel.com.br
```

- [ ] **Step 3: Build + preview**

Run: `bun run build && bun run preview`
Expected: imprime a URL local, ex. `http://localhost:4173/`. Anotar a porta.

- [ ] **Step 4: Testar cada host no navegador**

Para cada host, usando a porta do Step 3:

- `http://loja.gallobasediesel.com.br:<porta>/` → deve mostrar a home da loja (`StorefrontHomePage`) direto, com a barra de endereço mostrando só `/` (sem `/loja`).
- Navegar para o carrinho (ou outro link interno da loja) → a barra de endereço deve mostrar `/carrinho`, **não** `/loja/carrinho`.
- Usar o botão Voltar do navegador → deve voltar corretamente pra home da loja, ainda sem prefixo visível.
- Repetir para `portal.gallobasediesel.com.br` e `pwa.gallobasediesel.com.br`.
- `http://crm.gallobasediesel.com.br:<porta>/` → comportamento inalterado (continua mostrando `/app/...` como hoje).

- [ ] **Step 5: Reverter as mudanças temporárias**

```bash
git status
git checkout -- vite.config.ts
```

Remover as 4 linhas adicionadas em `C:\Windows\System32\drivers\etc\hosts`.

---

## Self-Review

- **Cobertura do spec:** seção 1 (Vercel/domínios) já foi executada manualmente pelo dono fora deste plano (infra, não código); seção 2 (mapa host→prefixo) = Task 1; seção 3 (history virtual) = Tasks 2–4; seção 4 (áreas não tocadas) = nenhuma mudança em arquivos de rota, confirmado; seção 5 (sessões por área) = nenhuma mudança necessária, já isoladas por origem; seção 6 (riscos) = Task 5 (navegação hardcoded) + Task 6 (teste real de subdomínio); seção 7 (rollout) = sem migration/Edge Function/mudança de rota, confirmado em todas as tasks.
- **Placeholders:** nenhum — todo step tem código completo ou comando+resultado esperado.
- **Consistência de tipos:** `getHostPrefix(hostname: string): string`, `applyHostPrefix(prefix: string, pathname: string): string`, `stripHostPrefix(prefix: string, href: string): string`, `createPrefixedBrowserHistory(opts: { hostname: string; window?: typeof window }): RouterHistory` — usados de forma consistente entre Tasks 1–4.
