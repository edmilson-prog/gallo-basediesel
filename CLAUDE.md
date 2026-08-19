# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

**GALLO BASE DIESEL** — Plataforma SaaS de inteligência comercial para distribuidora de peças pesadas (Volvo, Scania, Mercedes-Benz, Ford Cargo, Iveco) em Frederico Westphalen/RS. Posiciona-se **acima do ERP DINTEC** como cérebro comercial e relacional. Marca guarda-chuva com 3 submarcas: PARTS (verde), SERVICE (vermelho), INDUSTRIAL (amarelo). Mantida pela AILA Sistemas Inteligentes.

**Estado atual — em produção.** Desde o go-live (2026-06-10), `crm.gallobasediesel.com.br` roda **Supabase em dados e auth**; PITR habilitado, backups semanais, Sentry e healthcheck público ativos. O que existe hoje:

- **Dados** — schema `public` no Supabase, **todas as tabelas com RLS**; migrations versionadas em `supabase/migrations/`; providers em `src/providers/data/impl/{mock,supabase}/`.
- **WhatsApp** — multi-instância e multi-engine (Meta Cloud, Evolution, Evolution-Go, WAHA, OpenWA): webhook, envio, status tracking, janela de 24h, templates HSM e failover. Camada runtime-agnostic em `src/providers/whatsapp/`.
- **Atendimento** — Inbox, conversa, distribuição, fila de rodízio, SDR, copiloto. Acesso governado pelo modelo de "2 portões" (instância + carteira).
- **Pessoas & acesso** — papéis editáveis (RBAC persistido em tabelas, enforcement por `base_role` no JWT), departamentos, horário de atendimento, rodízio, 2FA TOTP opcional.
- **Comercial/financeiro** — clientes, veículos, leads, orçamentos, pedidos, catálogo, analytics de vendas, metas, comissões, despesas, DRE, fluxo de caixa.
- **Outros** — storefront B2C (checkout faz handoff por WhatsApp, write-free), portal B2B, PWA do vendedor externo, gestão de mídia, envio rápido, área de IA/LLM.
- **Edge Functions** em `supabase/functions/`. Chaves de API vivem no **Supabase Vault** (resolução Vault-first com fallback env), nunca no banco nem no código.

**Onde está o resto do contexto** — consulte, não replique aqui:

| Preciso saber… | Leia |
|---|---|
| o que mudou em cada release | `CHANGELOG.md` — fonte única do histórico |
| o que ainda está pendente | `docs/fase2-pendencias.md` — doc mestre de pendências |
| como funciona um subsistema | `docs/dev/` (ex.: `conversation-access-model.md`, `whatsapp-*.md`, `rotation-queue.md`, `work-schedule-access.md`, `ai-llm-integration.md`, `environment-mode.md`, `integration-secrets.md`, `ux-guidelines.md`) |
| mexer em PWA, manifest, ícone ou instalação | **`docs/dev/pwa-apps.md` — leia ANTES.** Dois apps instaláveis dividem esta origem e as regras de iOS já custaram 4 rodadas de bug |
| requisitos de uma feature | `docs/prds/` — mestre: `briefing-execucao-prds.md` |
| operação, backup e DR | `docs/infra/`, `docs/ops/` |

⚠️ **Regras de infra que não estão em nenhum arquivo do repositório:**

- Todo `apply_migration` via MCP **deve** ser exportado para `supabase/migrations/` no mesmo PR. **Mergear o PR não aplica a migration** — a aplicação em produção é manual e exige OK explícito do dono.
- Mudou `src/providers/whatsapp/`? Rode `scripts/sync-whatsapp-shared.ts` (espelha os núcleos em `supabase/functions/_shared/whatsapp/`) e redeploye as Edge Functions afetadas.
- Mudou `src/features/fiscal-notes/engine/{nfeKey,xml,nfeParser,costAllocation}.ts`? Rode `bun run sync:fiscal` (espelha em `supabase/functions/_shared/fiscal/`) e redeploye as Edge Functions de nota fiscal. Esses quatro módulos rodam em dois runtimes — **não podem depender de DOM**, porque o Deno não tem `DOMParser`.
- Deploy de Edge Function: **`bun run fn:deploy <nome>`** — também exige OK explícito do dono. Use o script, não o `npx supabase functions deploy` cru: o vínculo com o projeto vive em `supabase/.temp/project-ref` (gitignored, portanto ausente em todo clone e em toda worktree nova), e sem ele o CLI abre um "Select a project" que lista também o projeto **pausado** da conta — escolher errado falha com `status 'INACTIVE'`. O script já leva `--project-ref njizaasajkdqptlxddqn` (produção); o ref também está anotado em `supabase/config.toml`.

> ⚠️ **Worktrees — IGNORAR.** A pasta `.claude/worktrees/` (qualquer caminho contendo `worktrees`) contém git worktrees isoladas de outras branches e **não faz parte da branch `main`**. Ao explorar, buscar (grep/glob), editar ou raciocinar sobre o código, **ignore completamente** esse diretório. Trabalhe apenas no diretório principal do projeto (sobretudo `src/`). Não relate, edite nem referencie arquivos dentro de `worktrees`.

> 🚫 **Nunca crie branches nem faça commits diretamente no diretório principal.** O diretório principal (`D:\claude\gallo-basediesel`, fora de `worktrees/`) deve **sempre** permanecer na `main`, sincronizado com `origin/main` — nunca com uma branch de feature/fix/docs checkada nele. Toda tarefa que exija modificar código, documentação, migrations ou qualquer arquivo do projeto **deve** começar criando uma **worktree isolada** (`git worktree add .claude/worktrees/<nome> -b <branch>`, ou a ferramenta `EnterWorktree` quando disponível) e trabalhar a partir dela. Essa regra é **imperativa em toda sessão nova**, independente de memória ou contexto prévio.

> 🛑 **JAMAIS exclua uma worktree sem autorização expressa do dono.** Vale para qualquer forma de remoção: `git worktree remove`, `git worktree prune`, `rm -rf .claude/worktrees/<nome>`, `ExitWorktree` com remoção e a limpeza oferecida ao encerrar a sessão — em todas, o default é **manter** (`keep`). O motivo: a worktree pode conter trabalho não commitado ou não pushado, e **outras sessões podem estar trabalhando nela em paralelo** — remover destrói trabalho alheio de forma irreversível. **Mergear o PR não autoriza remover a worktree**; branch mergeada **não** é sinal de worktree descartável. Só remova quando o dono disser, nesta conversa, **qual** worktree remover — nunca por inferência, nunca "para limpar", nunca junto de outra tarefa.

## Comandos

Gerenciador de pacotes: **bun** (`bun.lock` presente). Scripts em `package.json` — `bun run dev | build | lint | format | test`.

- **Suite de testes:** **Vitest** (`bun run test`) — arquivos `*.test.ts` co-localizados. TDD nos `engine/` de negócio.
- ⚠️ **O `bun run build` (Vite/esbuild) NÃO faz type-check** — transpila sem checar tipos. Para checagem de tipos rode `bunx tsc --noEmit` à parte. Há um baseline de erros pré-existentes em `tsc`; avalie **código novo por delta** (cruze com `git diff --name-status main...HEAD --diff-filter=A` para isolar arquivos criados na branch). O gate prático de CI é `bun run build` + `bun run test`.
- Os scripts `pre*` (`predev`, `prebuild`, `prebuild:dev`, `prepreview`) rodam `node scripts/copy-changelog.mjs`, que copia o `CHANGELOG.md` para `public/` para consumo em runtime (página "Sobre/Novidades"). Rodar Vite sem o pre-hook deixa o changelog em runtime desatualizado.

## Stack e arquitetura

- **Modelo de deploy:** SPA estática na Vercel, **sem SSR**. `vercel.json` faz rewrite de todas as rotas para `/index.html`.
- **Router:** TanStack Router file-based, **sem** TanStack Start. Rotas em `src/routes/`; `routeTree.gen.ts` é **gerado** pelo plugin do Vite — nunca editar à mão. Root route em `src/routes/__root.tsx`. Meta tags, fontes, favicons e o script anti-FOUC vivem no `index.html`.
- **Árvore de providers** (em `__root.tsx`, de fora para dentro — a ordem importa): `QueryClientProvider` → `ThemeProvider` → `CopilotSettingsProvider` → `DataProvidersProvider` → `NotificationProvidersProvider` → `AuthProvider` → `MultistoreProvider` → `<Outlet>`.
- **UI:** Tailwind CSS v4 + shadcn/ui (style `new-york`, baseColor `slate`) em `src/components/ui/`. Iconify (`@iconify/react`) é o ícone padrão, via o wrapper `src/components/Icon.tsx`.
- **Estado:** TanStack Query no servidor (`QueryClient` criado em `src/router.tsx`, injetado via router context) + Zustand no cliente (estado leve, sobretudo o store da camada de mocks). Sem Redux.
- **Formulários:** react-hook-form + zod. **Toasts:** sonner.
- **Path alias:** `@/*` → `src/*`.

## Estrutura de pastas

- `src/features/<feature>/` — **arquitetura ativa; código novo vai aqui.** Cada feature pode ter `components/`, `hooks/`, `pages/`, `utils/`, `engine/` (lógica de negócio pura, testada), `api/`, `store/`, `i18n/` e um barrel `index.ts`.
- `src/routes/` — file-based. Prefixos: `app.*` (SaaS logado), `app.gestao.*`, `app.configuracoes.*`, `auth.*` (login), `loja.*` (storefront B2C), `portal.*` (portal B2B), `pwa.*` (vendedor externo).
- `src/providers/data/` — Provider Pattern (abaixo). `src/mocks/` — camada de dados fictícios, **privada** (barrel público único: `src/mocks/index.ts`).
- `src/shared/` — `types/` (modelo de domínio), `hooks/`, `utils/`.
- ⚠️ **Legado em fim de vida** — coexiste, mas **não recebe código novo**: `src/components/` (fora de `ui/`), `src/hooks/`, `src/lib/`, `src/config/`. Atenção: o hook de tema ainda vive em `src/hooks/useTheme.ts` (não em `shared/hooks`).

## Camada de dados, Provider Pattern e mocks

- **Provider Pattern (PRD-005):** features **nunca** consomem `src/mocks/` diretamente. Acessam dados via `useXxxProvider()` de `@/providers/data`. O `factory.ts` monta `mockProviders`/`supabaseProviders`.
- **Fronteiras impostas por ESLint** (`eslint.config.js`, `no-restricted-imports`): fora de `src/mocks/**` e `src/providers/data/**`, são **proibidos**: import de `@/mocks` / `@/mocks/api/*` (use providers), de módulos internos do mock (`store`/`generators`/`data`/`config`), de `@/providers/data/impl/*`, de `@/providers/data/contracts/*` individuais e de `@/providers/data/factory`. Tudo passa pelo barrel `@/providers/data`. Exceção: `src/routes/design-system.tsx` (usa utilitário de reset de seed).
- **Switch de fonte de dados:** `getDataProviders()` resolve `VITE_DATA_SOURCE=mock|supabase` (default `mock`; valor inválido cai em `mock` com warning em dev). Há também um override por navegador em `localStorage` (Configurações → Avançado → Ambiente & Dados) — **não é fronteira de segurança**; RLS e Auth seguem governando. Ver `docs/dev/environment-mode.md`.
- **Dados determinísticos:** base mock gerada por seed (`seedrandom` + `@faker-js/faker`) — mesmo dataset entre reloads. Volumes/seed em `src/mocks/config.ts`.
- **Auditoria:** mutações registram trilha via `auditLogger` (`recordAuditLog` async / `recordAuditLogSync`).

## Modelo de domínio

Tipos em `src/shared/types/` (barrel em `index.ts`), interfaces prefixadas com **`I`**. Padrões transversais:

- **Multi-loja desde o modelo** — `IStore` é entidade de primeira classe; toda entidade comercial carrega `storeId`. Seleção de loja via `MultistoreProvider`.
- **Campo `division: 'parts' | 'service' | 'industrial'`** em entidades comerciais — default `parts` no MVP; SERVICE e INDUSTRIAL ficam dormentes mas modeladas.

## Convenções de código

- **TypeScript:** `strict: true`. Evitar `any`. Interfaces de domínio prefixadas com `I`.
- **Temas:** componentes consomem **APENAS tokens semânticos** (`bg-background`, `text-foreground`, `border-border`, `text-/bg-/border-severity-*`). Nunca referenciar primitivos `--gallo-*` nem hex direto. Mecânica completa em `.claude/rules/temas.md`.
- **Regras de UX (obrigatório em telas novas/reformadas):** seguir `docs/dev/ux-guidelines.md` — header glassmorphism com tokens semânticos, linha de progresso de scroll na divisa do bloco fixo (`ScrollProgressBar`), busca com largura dinâmica + atalho `/` + `kbd` + `Escape`, tabelas com colunas redimensionáveis (`@/shared/hooks/useResizableColumns`, persistência `gallo-<feature>-column-widths`), delimitadores verticais **somente no header** e menu de visibilidade de colunas no **clique-direito do cabeçalho** (`ContextMenu` "Colunas visíveis" + "Exibir todas").
- `bunfig.toml` impõe **24h supply-chain guard** (`minimumReleaseAge = 86400`). Antes de adicionar pacote à `minimumReleaseAgeExcludes`, **confirmar com o usuário**.

## Fluxo de desenvolvimento dirigido por PRD

Toda implementação substantiva é guiada por um PRD em `docs/prds/`. Documento mestre: `docs/prds/briefing-execucao-prds.md` — modelo conceitual completo, índice dos PRDs e decisões arquiteturais transversais. PRDs concluídos levam o sufixo **`_DONE`** no nome do arquivo; ressalvas e itens deferidos ficam anotados no cabeçalho do próprio PRD.

Padrões arquiteturais que devem ser preservados ao implementar features:

- **Provider Pattern** — features acessam dados só via `@/providers/data`; switch Mock → Supabase por `VITE_DATA_SOURCE`.
- **Multi-loja** — `IStore` de primeira classe; toda entidade comercial carrega `storeId`.
- **Campo `division`** — `parts` default; `service`/`industrial` modeladas e dormentes.
- **Feature folder** — novo código em `src/features/<feature>/` com barrel `index.ts`; lógica de negócio em `engine/` (testada com Vitest).

## Versionamento e changelog

- **SemVer.** MINOR/MAJOR recebem **codinome em inglês** (atual: `Dispatch` — v0.186.0). Cada bump ganha uma tag `vX.Y.Z` (lista completa: `git tag -l`).
- A versão vive **só** no `package.json` e é injetada em build como `__APP_VERSION__` (via `define` no `vite.config.ts`).
- **`CHANGELOG.md` é também o changelog da UI** — os pre-scripts o copiam para `public/`, e a página "Sobre/Novidades" lê essa cópia. Não existe segundo arquivo de changelog.
- Bump após PRD completo (obrigatório) ou quando solicitado para um acumulado de fixes diretos.
