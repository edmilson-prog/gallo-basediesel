# Aviso reativo de nova versão (deploy) + recuperação de chunk quebrado

> **Feature:** `src/features/version-update/`
> **PR:** [#233](https://github.com/edmilson-prog/gallo-basediesel/pull/233) — branch `feat/deploy-update-notification` (merge `e33c6ea8`)
> **Release:** **v0.133.0 "Herald"** (commit de release `5c125b08`, tag `v0.133.0` + GitHub Release)
> **Escopo:** 100% frontend — **sem** migration, **sem** Edge Function, **sem** dependência nova
> **Status:** mergeado, lançado e validado end-to-end localmente (ver §8)

---

## 1. Problema

A plataforma é uma **SPA estática Vite (rolldown)** com `autoCodeSplitting` do TanStack Router: cada rota lazy vira um **chunk `.js` com hash no nome** (`app.gestao.vendas-DFa_mOtw.js`). A cada deploy o hash muda e os chunks do build anterior **somem** do domínio da Vercel.

Consequência para quem já estava logado com a aba aberta:

1. O usuário navega para uma rota que ele ainda **não tinha visitado** naquela sessão.
2. O bundle antigo tenta baixar um chunk cujo hash **não existe mais**.
3. O rewrite de SPA (`vercel.json`) devolve o `index.html` (`text/html`) no lugar do `.js`.
4. O `import()` dinâmico falha → o `ErrorComponent` raiz (`src/routes/__root.tsx`) renderiza a tela genérica **"Algo deu errado"**.

Sintomas observados em produção (console):

```
Failed to fetch dynamically imported module: https://.../assets/app-CpiVtC6Y.js
Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html"
```

**Objetivo:** avisar reativamente quem está logado que saiu um deploy novo (sem forçar), lembrar de forma persistente, aplicar **hard refresh** ao aceitar, e transformar o erro de chunk 404 (quando acontecer) numa recuperação automática em vez da tela de pânico.

---

## 2. Arquitetura (5 partes)

```
                         build time                              runtime (PROD)
  ┌───────────────────────────────────┐        ┌──────────────────────────────────────────┐
  │ vite.config.ts                    │        │ useDeployWatcher  ── poll /version.json ──▶│
  │  • __BUILD_ID__  (define)         │        │   a cada 60s + focus/visibility            │
  │  • /version.json (plugin build)   │        │   hasNewDeploy(local, remote) ?            │
  │    ambos com o MESMO BUILD_ID     │        │        │ sim                                │
  └───────────────────────────────────┘        │        ▼                                    │
                                                │ VersionUpdatePrompt (card flutuante)       │
  ┌───────────────────────────────────┐        │   "Atualizar agora" → hardReload           │
  │ REDE DE SEGURANÇA (se o watcher    │        │   "Agora não" → selo persistente (reabre)  │
  │ não pegar a tempo e o chunk 404):  │        └──────────────────────────────────────────┘
  │  • vite:preloadError (main.tsx)    │
  │  • ErrorComponent raiz (__root)    │  ── isChunkLoadError? → ChunkErrorScreen (auto-reload guardado ~3s)
  └───────────────────────────────────┘
```

1. **Build-id único por build** — `vite.config.ts` injeta `__BUILD_ID__` no bundle **e** emite `/version.json` com o mesmo valor, no mesmo processo de build. Garante que os dois sempre batem dentro de um build.
2. **Watcher (PROD-only)** — `useDeployWatcher` faz poll do `/version.json` e compara com o `__BUILD_ID__` embutido.
3. **Prompt flutuante** — `VersionUpdatePrompt` no `AppLayout`: card dispensável que minimiza para um selo persistente e reabre sozinho.
4. **Rede de segurança** — `vite:preloadError` + o error boundary raiz reconhecem o erro de chunk e recuperam via `ChunkErrorScreen` com reload guardado anti-loop.
5. **Hard reload** — `hardReload` limpa o Cache Storage (remove chunks órfãos) e recarrega. ⚠️ Ele **não** alcança o **HTTP cache do navegador** (armazenamento distinto do Cache Storage): uma resposta envenenada gravada ali fresca continua sendo servida a `import()`/`modulepreload` sem tocar a rede — foi o que prendeu um usuário por ~4h no incidente de 17/08 (ver §6).

---

## 3. Inventário de arquivos × commits

Cada task da execução (Subagent-Driven, TDD) virou 1 commit. Ordem cronológica:

| Commit | Task | Arquivos | Responsabilidade |
|--------|------|----------|------------------|
| `3599f6b3` | docs | `docs/superpowers/specs/2026-07-03-deploy-update-notification-design.md`, `docs/superpowers/plans/2026-07-03-deploy-update-notification.md`, `docs/html/version-update-flow-mockup.html` | Spec + plano TDD + mockup visual |
| `e254e967` | 1 | `vite.config.ts`, `src/vite-env.d.ts`, `vercel.json` | Build-id único + emissão de `/version.json` + header `no-store` |
| `adf776a9` | 2 | `engine/chunkError.ts` (+`.test.ts`) | `isChunkLoadError` — reconhece o erro de chunk por mensagem |
| `fb305336` | 3 | `engine/deployGate.ts` (+`.test.ts`) | Decisões puras: `hasNewDeploy`, `shouldReopenPrompt`, `shouldAttemptChunkReload` |
| `a8521252` | 4 | `lib/buildId.ts` (+`.test.ts`) | `getLocalBuildId`, `parseVersionJson`, `fetchRemoteBuildId` (fail-open) |
| `2683c3ad` | 5 | `lib/hardReload.ts` | `hardReload` + reload guardado (`can/commit/attemptGuardedChunkReload`) |
| `b2cf0344` | 6 | `preloadErrorHandler.ts`, `src/main.tsx` | Handler do `vite:preloadError` chamado no boot |
| `1c14fdef` | 7 | `components/ChunkErrorScreen.tsx`, `i18n/pt-BR.ts`, `src/routes/__root.tsx` | Tela de recuperação no error boundary raiz |
| `d0f794f2` | 8 | `hooks/useDeployWatcher.ts` | Hook de poll (PROD-only) |
| `28456ce9` | 9 | `components/VersionUpdatePrompt.tsx`, `src/features/shell/layouts/AppLayout.tsx` | Card flutuante + selo + montagem no layout |
| `9a147eb2` | fix (review final) | `preloadErrorHandler.ts`, `components/ChunkErrorScreen.tsx` | `preventDefault` condicional + `type="button"` (ver §6) |
| `e33c6ea8` | — | (merge) | Merge do PR #233 na `main` |
| `5c125b08` | — | `package.json`, `CHANGELOG.md`, `CLAUDE.md` | Bump v0.133.0 Herald |

Barrel público: `src/features/version-update/index.ts` exporta `initPreloadErrorHandler`, `isChunkLoadError`, `ChunkErrorScreen`, `VersionUpdatePrompt`.

---

## 4. Detalhamento por camada

### 4.1 Build-id + manifesto (`vite.config.ts`)

```ts
// Único por build: sha do git (legível) + timestamp (único mesmo em redeploy do mesmo commit)
const BUILD_TIMESTAMP = Date.now();
function resolveBuildId(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const shaShort = sha ? sha.slice(0, 7) : "local";
  return `${shaShort}.${BUILD_TIMESTAMP}`;   // ex.: "5c125b0.1783184639289"
}
const BUILD_ID = resolveBuildId();

// Plugin build-only: em `vite dev` o version.json NÃO é gerado (ausência = "sem info" no watcher)
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

- `define.__BUILD_ID__` injeta o **mesmo** `BUILD_ID` no bundle. Como plugin e `define` leem a mesma constante, o valor embutido e o do `/version.json` **sempre batem** naquele build.
- `src/vite-env.d.ts` declara `declare const __BUILD_ID__: string;`.
- `vercel.json` serve o manifesto sem cache:

```json
{ "source": "/version.json",
  "headers": [{ "key": "Cache-Control", "value": "no-store, max-age=0, must-revalidate" }] }
```

### 4.2 Watcher (`hooks/useDeployWatcher.ts`)

- **Gate PROD:** primeira linha do efeito é `if (!import.meta.env.PROD) return;` — em `vite dev` a feature fica inteiramente desligada.
- Poll a cada **60s** (`POLL_INTERVAL_MS`) **+** re-check em `visibilitychange` e `focus` (cobre a aba deixada aberta por vários deploys).
- Para de pollar assim que detecta (`readyRef` + `clearInterval`).
- `AbortController` + limpeza completa de listeners no unmount.
- **Fail-open:** `fetchRemoteBuildId` engole qualquer falha (offline, 404 em dev, não-JSON, abort) devolvendo `null`; `hasNewDeploy(local, null) === false` → nunca há falso positivo.

### 4.3 Prompt flutuante (`components/VersionUpdatePrompt.tsx`)

- Renderiza `null` até `updateReady`.
- **Card** (`fixed bottom-right z-50`, `bg-card`, ícone `mdi:rocket-launch-outline` em `bg-info/10 text-info`):
  - **"Atualizar agora"** → `hardReload()`.
  - **"Agora não"** → `setDismissedAt(Date.now())` → vira **selo persistente** (pílula com dot pulsante `bg-info`; o ping respeita `motion-reduce:hidden`).
- Reabre sozinho: enquanto minimizado, um `setInterval` de **30s** (`REOPEN_TICK_MS`) checa `shouldReopenPrompt` e, passados **15 min** (`REOPEN_INTERVAL_MS`), zera o `dismissedAt` e o card volta.
- Montado no `AppLayout` logo após o `<WhatsNewModal />`.

### 4.4 Rede de segurança (chunk 404)

Dois pontos de captura, ambos passando por `isChunkLoadError` e recuperando via reload guardado:

1. **`vite:preloadError`** (`preloadErrorHandler.ts`, registrado em `main.tsx` no boot) — o evento nativo do Vite disparado quando um `import()` de chunk falha, **antes** de virar erro de render.
2. **Error boundary raiz** (`src/routes/__root.tsx`) — rede final: se o erro escapou até o `ErrorComponent`, ele checa `isChunkLoadError(error)` e renderiza `ChunkErrorScreen` no lugar da tela genérica.

`isChunkLoadError` casa por mensagem (case-insensitive), cobrindo as variações de navegador:

```ts
/failed to fetch dynamically imported module/i
/error loading dynamically imported module/i
/importing a module script failed/i
/loading chunk \d+ failed/i
/expected a javascript(-or-wasm)? module script/i   // Chrome, quando o rewrite serve index.html
```

`ChunkErrorScreen` (título **"Nova versão disponível"**): auto-recarrega em **~3s** (`AUTO_RELOAD_DELAY_MS`) via `commitGuardedChunkReload`, **exceto** se o guard já disparou para este build — aí mostra só o botão manual (não fica em loop).

### 4.5 Hard reload + loop guard (`lib/hardReload.ts`)

```ts
export async function hardReload(): Promise<void> {
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));  // remove chunks órfãos
    }
  } catch { /* best-effort — nunca bloqueia o reload */ }
  window.location.reload();
}
```

**Loop guard** — chave `sessionStorage` `gallo-chunk-reload-attempt` = build-id do último auto-reload:

- `canGuardedChunkReload()` → `true` a menos que já tenhamos recarregado **para este exato build**.
- `commitGuardedChunkReload()` grava o build-id **antes** de recarregar.
- `attemptGuardedChunkReload()` → recarrega e devolve `true`; se o guard bloqueia, devolve `false` (o chamador mostra ação manual).
- Auto-clear: após um reload bem-sucedido o build-id muda, o valor gravado deixa de casar (`shouldAttemptChunkReload`) e o guard se rearma sozinho. Se o reload **não** resolveu (falha persistente, ex. rede), o guard segura o segundo disparo → sem loop.

---

## 5. Constantes e chaves

| Constante | Valor | Onde |
|-----------|-------|------|
| `POLL_INTERVAL_MS` | `60_000` (60s) | `useDeployWatcher` |
| `REOPEN_INTERVAL_MS` | `15 * 60_000` (15 min) | `VersionUpdatePrompt` |
| `REOPEN_TICK_MS` | `30_000` (30s) | `VersionUpdatePrompt` |
| `AUTO_RELOAD_DELAY_MS` | `3000` (~3s) | `ChunkErrorScreen` |
| `CHUNK_RELOAD_GUARD_KEY` | `"gallo-chunk-reload-attempt"` (sessionStorage) | `hardReload` |
| Header `/version.json` | `Cache-Control: no-store, max-age=0, must-revalidate` | `vercel.json` |
| Fetch do watcher | `fetch("/version.json", { cache: "no-store" })` | `buildId.ts` |

---

## 6. Decisões de design (e o "porquê")

- **Gatilho = build-id, não minor/major.** O bug de chunk 404 acontece em **qualquer** deploy (inclusive patch). Comparar build-id pega todos; comparar versão semântica deixaria passar os patches — justamente os mais frequentes.
- **`version.json` + `__BUILD_ID__` gerados no mesmo build.** Elimina a corrida "servidor anuncia versão X mas o bundle é Y": dentro de um build os dois são idênticos por construção.
- **`no-store` no manifesto.** Sem isso, um CDN/browser poderia servir um `version.json` cacheado e o watcher nunca veria o deploy novo. O fetch também usa `cache: "no-store"` (cinto e suspensório).
- **Fail-open em toda a borda de rede.** Qualquer falha do fetch vira `null` → `hasNewDeploy` `false`. A feature nunca incomoda o usuário por engano.
- **Não força reload.** Respeita o pedido original: o usuário pode estar no meio de algo importante. O aviso é dispensável, mas **persistente** (selo + reabertura em 15 min).
- **Service worker: o que ele garante — e o que não garante.** `public/sw.js` (PRD-070) cacheia **só assets** (style/script/image/font), **nunca** intercepta navegação/HTML (`request.mode === "navigate"` → rede), e desde o PR #427 só grava no Cache Storage respostas cujo `content-type` casa com o `request.destination` (`isCacheableResponse`); entrada já gravada que reprove na guarda é apagada. **Limites comprovados por dois incidentes:** (a) 09/08 — cache-first de asset bastou para travar o app mesmo com o shell vindo fresco da rede: o SW servia HTML gravado sob URL de `.js` **antes** de consultar a rede, e nem hard reload resolvia; (b) 17/08 — o `fetch(request)` do SW consulta o **HTTP cache do navegador** (camada abaixo do SW), e a guarda só impede *gravar*, não *repassar*: um HTML fresco no disk cache sob URL de chunk atravessa o SW e chega à página por até 4h; `hardReload` não alcança essa camada. Regra operacional: **sempre bumpar `CACHE_VERSION`** ao mudar regra de cache do worker — a purga no `activate` é o que cura clientes já envenenados; `/sw.js` é servido com `no-store` (`vercel.json`) para a correção propagar (no incidente de 09/08 a cópia em CDN tinha `Age: 86004`).
- **404 real para estático ausente (issue #430, pós-incidente de 17/08).** O rewrite SPA do `vercel.json` usa exclusão negativa (`/assets/`, `logos/`, `social/`, `version.json`, `CHANGELOG.md`, webmanifests, `sw.js`, favicons/ícones): arquivo estático **ausente** responde `404` de verdade em vez de `200 text/html`. Antes, o HTML-sob-URL-de-asset saía cacheável (`max-age=14400` na borda) e envenenava o HTTP cache do navegador na janela de troca de deploy — com 404, o auto-reload da rede de segurança **cura** em segundos em vez de prender. A matriz de paths é guardada por `engine/spaRewrite.test.ts`; `readChangelogPayload`/`classifyVersionResponse` completam o cinto e suspensório nos dois `fetch()` de dados que engoliam o HTML em silêncio. ⚠️ Não adicionar `Cache-Control` longo/`immutable` para `/assets/` sem antes provar em produção que a Vercel não anexa o header a respostas `404` do mesmo path — senão um 404 apanhado na janela de deploy ficaria cacheado por 1 ano no navegador.
- **Correção do review final (opus) — `preventDefault` condicional (`9a147eb2`).** Na primeira versão o `preventDefault()` do `vite:preloadError` era **incondicional**. Isso tornava o `ChunkErrorScreen` **inalcançável** no caminho em que o loop guard bloqueia o reload: o Vite suprimia o re-throw, o `import()` resolvia para `undefined`, o React quebrava com "Element type invalid" e caía na tela **genérica**. O fix chama `preventDefault()` **só quando** `attemptGuardedChunkReload()` de fato recarrega; quando o guard bloqueia, deixa o import rejeitar → o boundary raiz pega um erro **real** e mostra a tela de recuperação com botão manual. (No mesmo commit, `type="button"` explícito nos botões.)

---

## 7. Relação com o "modal de novidades" (Whats-New)

O pedido original incluía "depois de atualizar, exibir o modal de novidades". Isso **não exigiu código novo**: o `WhatsNewModal` (`src/features/whats-new/`) já abre automaticamente quando detecta mudança de versão (minor/major), lendo o `/CHANGELOG.md`. Uma vez que o hard refresh cai no build novo (versão nova), o comportamento pré-existente do modal exibe as novidades naturalmente. Esta feature **não altera** o Whats-New — apenas garante que o usuário chegue ao build novo para que ele dispare.

---

## 8. Testes e validação

**Unitários (Vitest, co-localizados, TDD):**

- `engine/chunkError.test.ts` — 9 casos das 5 assinaturas + negativos.
- `engine/deployGate.test.ts` — 10 casos (`hasNewDeploy` com remoto nulo/igual/diferente; `shouldReopenPrompt` com `>=`; `shouldAttemptChunkReload`).
- `lib/buildId.test.ts` — `parseVersionJson` (4 casos) + `classifyVersionResponse` (5 casos: HTML-com-200, status não-ok, corpo sem buildId, content-type ausente).
- `engine/spaRewrite.test.ts` — matriz do rewrite do `vercel.json` (rotas SPA continuam no shell; estáticos ausentes respondem 404; headers `no-store` preservados; ausência de header longo para `/assets/`).
- `src/features/about/parser/readChangelogPayload.test.ts` — guarda do `/CHANGELOG.md` (HTML por content-type, HTML sem content-type, corpo válido, corpo vazio).

Gate prático de CI: `bun run build` + `bun run test` (lembrete: `bun run build` **não** faz type-check; código novo avaliado por delta).

**Validação manual end-to-end (local, `bun run preview` — a feature é PROD-only, não roda em `vite dev`):**

1. `bun run build` gera o build A (`local.<ts1>`); `vite preview` serve em `http://127.0.0.1:4173/`.
2. Com a aba aberta no build A, um novo `bun run build` gera o build B (`local.<ts2>`) e o preview passa a servir o `version.json` de B.
3. **Confirmado:** o watcher da aba (ainda no build A) detecta o mismatch → card **"Atualização disponível"** aparece.
4. **Confirmado:** "Atualizar agora" → hard refresh → cai no build B (onde `__BUILD_ID__` = `version.json`) → **o card some e não reaparece** (validado pelo dono).
5. Selo + reabertura e a `ChunkErrorScreen` (navegar para rota não visitada após o rebuild) verificados no fluxo.

> Nota sobre simulação "só `version.json`": trocar apenas o `version.json` servido (sem gerar bundle novo) faz o "Atualizar agora" cair no **mesmo** build → o card reaparece. É artefato da simulação, não do produto. O teste fiel exige um `bun run build` real (passo 2 acima).

---

## 9. Gate de rollout (pós-deploy Vercel)

Após o deploy que publica esta feature, validar que o manifesto é servido corretamente:

```bash
curl -I https://crm.gallobasediesel.com.br/version.json
# esperado: HTTP 200 · Content-Type: application/json · Cache-Control: no-store
# (NÃO pode devolver index.html / text/html)
```

⚠️ **Ressalva do 1º deploy:** o deploy que *introduz* a feature não avisa quem já está no build anterior — aquele bundle ainda não tinha o watcher. O aviso passa a valer **a partir do deploy seguinte**. Do 2º em diante, todo usuário logado é avisado reativamente.

---

## 10. Limitações conhecidas / futuro

- **Divergência do mockup (registrada):** o mockup mostrava um contador visível de 5s na tela de erro; a implementação faz um reload guardado em ~3s (sem contagem regressiva na tela). Decisão consciente — simplicidade e menos superfície de estado.
- **Sem telemetria de adoção:** não medimos quantos usuários aceitam/adiam o card. Se virar necessidade, um evento de auditoria client-side é o gancho natural (ver ressalva do `audit_logs` 403 client-side em outra pendência antes de plugar).
- **Intervalo fixo:** 60s de poll e 15 min de reabertura são constantes de código, não configuráveis por Owner. Suficiente para o uso atual.

---

## Referências

- Spec: `docs/superpowers/specs/2026-07-03-deploy-update-notification-design.md`
- Plano TDD: `docs/superpowers/plans/2026-07-03-deploy-update-notification.md`
- Mockup: `docs/html/version-update-flow-mockup.html`
- Service worker: `public/sw.js` (PRD-070)
- Modal de novidades: `src/features/whats-new/`
