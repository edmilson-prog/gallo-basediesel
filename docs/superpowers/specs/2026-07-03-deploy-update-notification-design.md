# Design — Aviso reativo de nova versão (deploy) + hard refresh

**Data:** 2026-07-03
**Autor:** AILA Sistemas Inteligentes
**Status:** Aprovado o design conceitual (mockups) — pendente revisão deste spec
**Mockup:** `docs/html/version-update-flow-mockup.html`

---

## 1. Contexto e problema

A plataforma é uma SPA Vite estática servida pela Vercel. O TanStack Router roda com
`autoCodeSplitting`, então cada rota vira um **chunk lazy com hash no nome**
(`app-CpiVtC6Y.js`). A cada novo deploy, os chunks do build anterior **deixam de
existir** no domínio de produção.

Consequência para quem já está com a aba aberta quando sai um deploy:

1. **Quebra ao navegar** — ao entrar numa rota lazy cujo chunk sumiu, o browser
   tenta baixar um arquivo que não existe. O servidor devolve o `index.html`
   (rewrite SPA) com `Content-Type: text/html`, e o import falha com
   `Failed to fetch dynamically imported module` / `Expected a JavaScript-or-Wasm
   module script but the server responded with a MIME type of "text/html"`. Isso
   sobe até o `ErrorComponent` do `src/routes/__root.tsx` = a tela **"Algo deu
   errado"**. (Comprovado nos prints do incidente.)
2. **Sem consciência da atualização** — mesmo sem quebrar, o usuário continua
   rodando código velho sem saber que há uma versão nova disponível.

O que **já existe** e será reaproveitado:

- Feature `whats-new` (`WhatsNewModal` + `useWhatsNew` + `engine/versionGate`) que
  compara `lastSeenVersion` (localStorage) com o `/CHANGELOG.md` e abre o modal de
  novidades pós-login — **apenas para releases minor/major**.
- `useChangelog` busca `/CHANGELOG.md` (copiado para `public/` no pre-build por
  `scripts/copy-changelog.mjs`) com `staleTime: Infinity` — congelado por sessão.
- Constantes de build injetadas via Vite `define`: `__APP_VERSION__`, `__GIT_BRANCH__`.

## 2. Objetivos

1. **Detectar em runtime** que a versão em produção mudou, de forma reativa, para
   usuários logados — **em todo deploy** (não só nos com bump de versão).
2. **Avisar sem interromper**: um aviso dispensável que, ao ser ignorado, **minimiza
   para um selo persistente** e reabre sozinho de tempos em tempos ("pode ignorar,
   mas sempre lembra"). Nunca bloqueia a tela.
3. **Hard refresh ao aceitar**: limpar caches e recarregar, garantindo que o app suba
   100% na versão nova.
4. **Rede de segurança**: quando o erro de chunk chega antes do aviso, trocar a tela
   genérica "Algo deu errado" por "Nova versão disponível → Atualizar", só para erros
   de carregamento de chunk.
5. **Encadear o modal de novidades** existente após o refresh, sem mudança estrutural
   nele.

## 3. Não-objetivos (YAGNI)

- **Mexer no Service Worker** — já existe um SW (`public/sw.js`, PRD-070) que faz
  cache-first apenas de assets (`style`/`script`/`image`/`font`) e **nunca intercepta
  navegação/HTML** (`request.mode === "navigate"` sempre vai à rede). Ele não será
  alterado. O `hardReload` limpa o Cache Storage dele por robustez (remove chunks
  órfãos do build anterior). PWA offline/queue segue fora de escopo.
- **Persistir o estado "ignorado" entre reloads** — o `AppLayout` não desmonta durante
  a navegação SPA, então o estado em memória basta. Um F5 manual que já pega a versão
  nova zera o aviso naturalmente.
- **Avisar em portal B2B / PWA do vendedor externo com o card proativo** — nesta
  entrega o card vive só no app interno (`AppLayout`). Todos os shells herdam a rede de
  segurança do error boundary (root). Extensão do card para os outros shells fica para
  depois.
- **Mudar o gate/UX do modal de novidades** — ele continua abrindo por conta própria
  quando há minor/major.

## 4. Arquitetura

Cinco unidades independentes, cada uma com um propósito único.

### 4.1 Build-id único por deploy (fonte da verdade)

No `vite.config.ts`, computa-se **uma vez por build** um identificador único:

```
BUILD_ID = `${gitShaCurto || "local"}.${buildTimestamp}`
```

- `gitShaCurto` — de `process.env.VERCEL_GIT_COMMIT_SHA` (Vercel) ou `git rev-parse`
  (local); só para legibilidade/debug.
- `buildTimestamp` — carimbo do início do build; garante unicidade mesmo em redeploy do
  mesmo commit.

Esse valor vai para **dois lugares no mesmo processo de build** (garante que batem):

1. **Embutido no bundle** via `define: { __BUILD_ID__: JSON.stringify(BUILD_ID) }` — é o
   "build que esta aba está rodando".
2. **Emitido como `version.json`** por um plugin Vite inline (hook `generateBundle`,
   `emitFile` do tipo asset), servido em `/version.json`:

```json
{ "buildId": "7e582e4.1751558400000", "version": "0.130.0" }
```

Em **dev** (`vite dev`) o `generateBundle` não roda → `/version.json` não existe → o
watcher trata o 404 como "sem info, no-op" (nenhum falso positivo). Correto: não
queremos detectar deploy em dev.

Declaração de tipo nova em `src/vite-env.d.ts`: `declare const __BUILD_ID__: string;`.

### 4.2 Watcher de deploy (`useDeployWatcher`)

Hook que expõe `{ updateReady: boolean }`. Ativo **apenas em produção**
(`import.meta.env.PROD`); em dev retorna `updateReady: false` sem efeitos.

- Faz `fetch("/version.json", { cache: "no-store" })` em três gatilhos:
  - a cada **60s** (`setInterval`);
  - no evento `visibilitychange` quando a aba volta a ficar visível;
  - no evento `focus` da janela.
  (Cobre o caso "deixou a aba aberta a noite toda e voltou depois de vários deploys".)
- Compara `remote.buildId` com `__BUILD_ID__` via engine puro `hasNewDeploy`. Se
  diferente → `setUpdateReady(true)` e **encerra o polling** (não precisa mais).
- **Fail-open**: qualquer erro (offline, 404, JSON inválido) é engolido — continua
  pollando, nunca dispara falso positivo, nunca quebra o app.

### 4.3 O aviso (`<VersionUpdatePrompt />`) — card flutuante + selo

Componente montado no `AppLayout`, irmão dos guards existentes
(`SessionTimeoutGuard`, `InboxActivityGuard`…). Consome `useDeployWatcher`.

Estados:

- **Escondido** — `updateReady === false`.
- **Card aberto** — `updateReady && !dismissed`. Card flutuante no canto inferior
  direito: ícone, título "Atualização disponível", corpo, botões **"Atualizar agora"**
  (primário → `hardReload()`) e **"Agora não"** (→ `dismissed = true`, grava
  `dismissedAt = Date.now()` em memória).
- **Selo minimizado** — `updateReady && dismissed`. Pill persistente no mesmo canto com
  dot pulsante e rótulo "Atualização pronta"; clique reabre o card.

Reabertura automática: um timer reabre o card quando `now - dismissedAt >=
REOPEN_INTERVAL_MS` (padrão **15 min**). A decisão "deve reabrir?" é um engine puro
(`shouldReopenPrompt`) para ser testável. `prefers-reduced-motion` desliga o pulso.

### 4.4 Rede de segurança reativa (chunk-load-error)

Dois pontos de captura convergindo para o mesmo `hardReload()` guardado contra loop:

1. **`vite:preloadError`** (mecanismo oficial do Vite) — `initPreloadErrorHandler()`
   chamado no `src/main.tsx` registra `window.addEventListener("vite:preloadError", …)`.
   Quando um dynamic import falha, dispara o `hardReload()` guardado (4.6) antes de o
   erro virar tela de erro.
2. **Error boundary** (`ErrorComponent` do `__root.tsx`) — rede final para o que
   escapa. Se `isChunkLoadError(error)` → renderiza `<ChunkErrorScreen />` ("Nova versão
   disponível → Atualizar agora", com auto-reload guardado em ~5s) em vez de "Algo deu
   errado". Erros comuns seguem na tela genérica intacta.

`isChunkLoadError(error)` é um **engine puro testável** que casa a mensagem contra os
padrões conhecidos (case-insensitive):

- `Failed to fetch dynamically imported module`
- `error loading dynamically imported module`
- `Importing a module script failed`
- `Loading chunk \d+ failed`
- `Expected a JavaScript-or-Wasm module script … MIME type … text/html` (o do print)

### 4.5 Hard reload (`hardReload()`)

```
1. Se `caches` existir (Cache Storage API): apagar todas as chaves. (O SW
   `gallo-static-v1` faz cache-first de assets por URL; limpar remove os chunks órfãos
   do build anterior.)
2. window.location.reload();
```

Não se usa `location.reload(true)` (o argumento `forceGet` é obsoleto e ignorado). O
efeito que importa — baixar o build novo — é garantido porque (a) o SW **nunca cacheia
navegação/HTML**, então o reload sempre busca o `index.html` fresco na rede, e (b) a
Vercel serve o `index.html` com `must-revalidate`; ele aponta para os chunks com hash
novo. O browser não permite forçar Ctrl+Shift+R por script; a combinação acima é o
equivalente prático e suficiente (todo asset tem hash).

### 4.6 Guarda anti-loop

`sessionStorage["gallo-chunk-reload-attempt"]` guarda o `__BUILD_ID__` da última
tentativa automática de reload por chunk error. Antes de auto-recarregar (4.4):

- Se o valor gravado **≠** `__BUILD_ID__` atual → grava e recarrega.
- Se **==** (já tentamos nesta versão e ainda falha, ex.: CDN propagando) → **não**
  recarrega; mostra a tela/card com ação **manual**. Quebra qualquer loop.

Após um reload bem-sucedido o app sobe num `__BUILD_ID__` novo, então o valor gravado
(antigo) deixa de bater e a guarda se auto-limpa.

### 4.7 Modal de novidades (inalterado)

Após o `hardReload()`, o app remonta, `useWhatsNew` reavalia e o `WhatsNewModal` abre
naturalmente **quando o deploy trouxe minor/major**. Deploys patch não têm entrada de
modal — comportamento correto. Nenhuma mudança de código aqui; é encadeamento por
mecânica existente.

## 5. Estrutura de arquivos

```
src/features/version-update/
├── engine/
│   ├── chunkError.ts          # isChunkLoadError(error): boolean
│   ├── chunkError.test.ts
│   ├── deployGate.ts          # hasNewDeploy(local, remote); shouldReopenPrompt(...)
│   └── deployGate.test.ts
├── hooks/
│   └── useDeployWatcher.ts    # polling + estado updateReady (PROD-only)
├── lib/
│   ├── buildId.ts             # __BUILD_ID__ + fetch/parse de /version.json
│   └── hardReload.ts          # limpa caches + reload; guarda anti-loop
├── components/
│   ├── VersionUpdatePrompt.tsx  # card flutuante + selo
│   └── ChunkErrorScreen.tsx     # variante do error boundary (reutilizável)
├── preloadErrorHandler.ts     # initPreloadErrorHandler() p/ main.tsx
├── i18n/pt-BR.ts
└── index.ts                   # barrel público

Integrações (arquivos existentes tocados):
- vite.config.ts                 # __BUILD_ID__ no define + plugin emitindo version.json
- src/vite-env.d.ts              # declare const __BUILD_ID__
- src/main.tsx                   # initPreloadErrorHandler()
- src/routes/__root.tsx          # ErrorComponent → ChunkErrorScreen quando chunk error
- src/features/shell/layouts/AppLayout.tsx  # monta <VersionUpdatePrompt />
- vercel.json                    # header Cache-Control: no-store para /version.json
```

## 6. Fluxo / sequência

```
Deploy sai na Vercel
   │
   ▼
useDeployWatcher (aba aberta) faz poll → buildId remoto ≠ local
   │
   ▼
updateReady = true → <VersionUpdatePrompt/> mostra o card
   │
   ├── "Atualizar agora" ─────────────► hardReload() ──► app sobe na versão nova
   │                                                        └► WhatsNewModal (se minor/major)
   │
   └── "Agora não" ──► selo persistente ──(15 min)──► card reabre  ↺

Caminho de exceção (usuário clicou antes do aviso):
   navegação → chunk 404
      │
      ├── vite:preloadError → hardReload() guardado
      └── (se escapar) ErrorComponent → ChunkErrorScreen → "Atualizar agora" / auto-reload 5s
```

## 7. Cópia (pt-BR)

- **Card** — título: "Atualização disponível". Corpo: "Uma nova versão da plataforma
  está pronta. Atualize quando puder para aplicar as melhorias." Botões: "Atualizar
  agora" / "Agora não".
- **Selo** — "Atualização pronta" · "toque para atualizar".
- **ChunkErrorScreen** — título: "Nova versão disponível". Corpo: "A plataforma foi
  atualizada. Recarregue para continuar de onde parou." Botão: "Atualizar agora".
  Meta: "Recarregando automaticamente…".

## 8. Edge cases e tratamento de erro

| Caso | Comportamento |
|------|---------------|
| Dev (`vite dev`) | `/version.json` ausente → watcher no-op; sem card. |
| Offline / fetch falha | Engolido, continua pollando; sem falso positivo. |
| `version.json` cacheado pela CDN | `Cache-Control: no-store` na origem (vercel.json) + `cache:"no-store"` no fetch. |
| Reload não resolve (CDN propagando) | Guarda anti-loop mostra ação manual em vez de recarregar em loop. |
| localStorage/sessionStorage indisponível | try/catch → degrada para "sem guarda"/"sem persistência"; nunca quebra. |
| Primeiro deploy que introduz a feature | Quem já está no build anterior não tem o watcher; passa a funcionar a partir do deploy seguinte (intrínseco, documentado). |
| Erro comum (não-chunk) no boundary | Segue exibindo "Algo deu errado" (inalterado). |
| SW servindo chunk velho do cache | Cache-first por URL; chunks novos têm hash novo → cache miss → rede. `hardReload` limpa o cache por robustez. SW não intercepta HTML. |

## 9. Testes (Vitest, TDD nos engines)

- `chunkError.test.ts` — matriz de mensagens reais (as do print + variantes de
  browsers) → `true`; erros comuns (TypeError qualquer, erro de rede de API) → `false`.
- `deployGate.test.ts` — `hasNewDeploy`: iguais → false; diferentes → true; null/empty
  (remoto ausente) → false. `shouldReopenPrompt`: antes do intervalo → false; depois →
  true; sem `dismissedAt` → false.
- Componentes seguem o padrão da casa (lógica em engines testados; render mínimo).

## 10. Deploy / rollout

- **Sem backend**: nenhuma migration, Edge Function ou tabela. 100% frontend + config.
- **`vercel.json`**: adicionar bloco `headers` com `Cache-Control: no-store, max-age=0,
  must-revalidate` para `/version.json`. Precedência de filesystem sobre rewrites na
  Vercel garante que `/version.json` é servido como arquivo (não cai no rewrite SPA).
- **Gate de CI**: `bun run build` (gera `version.json`, valida o plugin) + `bun run
  test` (engines). `bunx tsc --noEmit` por delta nos arquivos novos.
- **Ordem**: é um PR único; ao mergear e deployar, o efeito começa a valer para as
  sessões abertas **a partir do deploy seguinte**.

## 11. Trade-offs e decisões

- **Build-id vs versão do CHANGELOG como gatilho** → build-id. Detecta todo deploy,
  inclusive os patches/hotfixes que são exatamente os que quebram os chunks. O CHANGELOG
  só muda em bump.
- **Card flutuante vs banner no topo** → card + selo. Não empurra conteúdo, não disputa
  espaço com os banners operacionais do topo, e o "minimiza para selo" resolve o
  "ignorar mas sempre lembrar" de forma limpa.
- **`vite:preloadError` + error boundary (ambos)** → captura reativa oficial do Vite na
  frente, boundary como rede final. Redundância barata que fecha o buraco do print.
- **Estado do aviso em memória (sem localStorage)** → o `AppLayout` persiste entre
  rotas; simplicidade. Persistir seria complexidade sem ganho real.

## 12. Riscos

- **Vercel não expor `version.json` como esperado** — mitigado pela precedência de
  filesystem sobre rewrites; validar no primeiro deploy (curl `/version.json`).
- **Falso positivo de `isChunkLoadError`** — mitigado por matriz de teste estrita e por
  só afetar a tela de erro (o auto-reload é guardado contra loop).
- **Fadiga de aviso** com muitos deploys num dia — mitigado pela minimização em selo e
  pelo intervalo de reabertura ajustável (15 min).
```