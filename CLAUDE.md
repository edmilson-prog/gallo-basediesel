# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

**GALLO BASE DIESEL** — Plataforma SaaS de inteligência comercial para distribuidora de peças pesadas (Volvo, Scania, Mercedes-Benz, Ford Cargo, Iveco) em Frederico Westphalen/RS. A plataforma se posiciona **acima do ERP DINTEC** como cérebro comercial e relacional. Marca guarda-chuva com 3 submarcas: PARTS (verde), SERVICE (vermelho), INDUSTRIAL (amarelo).

Estado atual: **Fase 1 (Frontend First)** — mockup navegável e funcional sobre uma camada de dados fictícios determinísticos (faker + seed). A arquitetura-alvo já está materializada (`features/`, `mocks/`, `providers/`, `shared/`) e a maioria dos PRDs comerciais foi implementada e marcada `_DONE` — incluindo os épicos recentes de gestão de mídia (PRD-026, "Vault") e envio rápido / biblioteca de ativos (PRD-027, "Dispatch"). Codinome atual `Dispatch` (v0.68.1). A migração Mock → Supabase (Fase 2, PRDs 100+) está preparada via Provider Pattern, mas ainda não ativada. Projeto mantido pela AILA Sistemas Inteligentes.

> ⚠️ **Worktrees — IGNORAR.** A pasta `.claude/worktrees/` (qualquer caminho contendo `worktrees`) contém git worktrees isoladas de outras branches e **não faz parte da branch `main`**. Ao explorar, buscar (grep/glob), editar ou raciocinar sobre o código, **ignore completamente** esse diretório. Trabalhe apenas no diretório principal do projeto (sobretudo `src/`). Não relate, edite nem referencie arquivos dentro de `worktrees`.

## Comandos

```bash
bun install          # instalar dependências (bun.lock presente)
bun run dev          # dev server (Vite + TanStack Router)
bun run build        # build de produção (Vite/esbuild)
bun run build:dev    # build em modo development
bun run preview      # preview do build
bun run lint         # ESLint
bun run format       # Prettier --write
bun run test         # Vitest (run único)
bun run test:watch   # Vitest em watch
bun run test:ui      # Vitest UI
```

- **Suite de testes:** **Vitest** (`bun run test`) — arquivos `*.test.ts` co-localizados (~39 arquivos). TDD nos `engine/` de negócio.
- ⚠️ **O `bun run build` (Vite/esbuild) NÃO faz type-check** — transpila sem checar tipos. Para checagem de tipos rode `bunx tsc --noEmit` à parte. Há um baseline de erros pré-existentes em `tsc`; avalie **código novo por delta** (cruze com `git diff --name-status main...HEAD --diff-filter=A` para isolar arquivos criados na branch). O gate prático de CI é `bun run build` + `bun run test`.
- Os scripts `pre*` (`predev`, `prebuild`, `prebuild:dev`, `prepreview`) rodam `node scripts/copy-changelog.mjs`, que copia o `CHANGELOG.md` para `public/` para consumo em runtime (página "Sobre/Novidades"). Rodar Vite sem o pre-hook deixa o changelog em runtime desatualizado.

## Stack e arquitetura

- **Modelo de deploy:** SPA estática hospedada na Vercel. `index.html` na raiz é o template Vite; `vercel.json` faz rewrite de todas as rotas para `/index.html` (padrão SPA). Sem SSR.
- **Entry:** `src/main.tsx` faz `createRoot` em `#root` e renderiza `<RouterProvider>`.
- **Vite config:** plugins explícitos em `vite.config.ts` — `tanstackRouter` (com `autoCodeSplitting`), `react`, `tailwindcss`, `tsconfigPaths`. Injeta constantes de build via `define`: `__GIT_BRANCH__` e `__APP_VERSION__` (usadas no footer dev-only e como fallback de versão). Sem framework wrapper opinionado por trás.
- **Router:** TanStack Router file-based (**sem** TanStack Start). Rotas em `src/routes/`; `routeTree.gen.ts` é **gerado** pelo plugin (não editar). Root route em `src/routes/__root.tsx`. Meta tags, Google Fonts, favicons e script anti-FOUC vivem no `index.html`.
- **Árvore de providers** (em `__root.tsx`, de fora para dentro): `QueryClientProvider` → `ThemeProvider` → `CopilotSettingsProvider` → `DataProvidersProvider` → `NotificationProvidersProvider` → `AuthProvider` → `MultistoreProvider` → `<Outlet>`.
- **React 19.**
- **UI:** Tailwind CSS **v4** + shadcn/ui (style `new-york`, baseColor `slate`) em `src/components/ui/`. Iconify (`@iconify/react`) é o ícone padrão; wrapper em `src/components/Icon.tsx` (`lucide-react` também disponível). Gráficos com **recharts**. Outras libs de UX: `cmdk` (command palette), `embla-carousel-react`, `vaul` (drawer), `react-day-picker`, `react-resizable-panels`, `three` (3D pontual).
- **Estado servidor:** TanStack Query — `QueryClient` criado em `src/router.tsx` e injetado via router context.
- **Estado cliente:** **Zustand** para estado leve em memória, sobretudo o store da camada de mocks. Sem Redux.
- **Formulários:** react-hook-form + zod + `@hookform/resolvers`.
- **Toasts:** sonner.
- **Path alias:** `@/*` → `src/*` (definido em `tsconfig.json` e `components.json`).

## Estrutura de pastas (arquitetura-alvo, já materializada)

```
src/
├── features/<feature>/   # arquitetura feature-driven ATIVA (~50 features)
│                         # ex.: customers, vehicles, leads, orders, quotes, catalog,
│                         #      sales-analytics, goals, commissions, expenses, cashflow,
│                         #      dre, conversations, sdr, media, quick-send, b2b-portal,
│                         #      storefront*, rbac, external-seller-pwa, multistore,
│                         #      shell (layout), about, ...
│                         # Cada feature pode ter: components/, hooks/, pages/, utils/,
│                         #      engine/ (lógica de negócio), api/, store/, i18n/, index.ts (barrel)
├── routes/               # TanStack Router file-based (~120 arquivos)
│                         # prefixos: app.* (SaaS logado), app.gestao.*, app.configuracoes.*,
│                         #           auth.* (login), loja.* (storefront B2C),
│                         #           portal.* (portal B2B), pwa.* (app do vendedor externo)
├── providers/data/       # Provider Pattern (camada de dados — ver abaixo)
│   ├── contracts/        # interfaces por domínio (IXxxProvider) + IDataProviders
│   ├── impl/mock/        # implementações mock (Fase 1)
│   ├── impl/supabase/    # stubs Supabase (Fase 2 — lançam NotImplementedError)
│   ├── hooks/            # useXxxProvider() — acesso via context
│   ├── factory.ts        # getDataProviders() seleciona o set por VITE_DATA_SOURCE
│   ├── context.tsx       # DataProvidersProvider (React context)
│   ├── errors.ts         # NotImplementedError, etc.
│   └── auditLogger.ts    # trilha de auditoria
├── mocks/                # camada de dados fictícios (Fase 1) — privada (ver ESLint)
│   ├── api/              # endpoints simulados (getCustomers, createOrder, ...)
│   ├── data/             # seeds estáticos (catálogo de peças, papéis, lojas, ...)
│   ├── generators/       # factories faker + seed determinístico (bootstrap)
│   ├── store/            # Zustand in-memory (mockStore)
│   ├── hooks/            # hooks internos da camada mock
│   ├── config.ts         # VOLUMES, seed default, latência, taxa de erro
│   └── index.ts          # ÚNICO barrel público da camada mock
├── shared/
│   ├── types/            # modelo de domínio (interfaces I*, ~30 arquivos) + barrel index.ts
│   ├── hooks/            # hooks compartilhados (ex.: usePersistedListSearch)
│   └── utils/            # contrast.ts, utils.ts
├── components/
│   ├── ui/               # shadcn/ui
│   ├── layout/           # wrappers de layout
│   ├── Icon.tsx          # wrapper Iconify
│   ├── Logo.tsx, ThemeSwitcher.tsx
│   └── ThemeProvider.tsx # context de tema (2 dimensões)
├── config/themes.ts      # tokens e metadados de tema, LOCALSTORAGE_KEYS
├── hooks/                # legado: useTheme.ts, use-mobile.tsx
├── lib/                  # legado: contrast.ts, utils.ts
└── main.tsx, router.tsx  # entry e setup do router
```

> A estrutura legada (`src/components`, `src/hooks`, `src/lib`, `src/config`) coexiste mas está em fim de vida — código novo vai em `features/`, `shared/`, `providers/` e `mocks/`. Atenção: o hook de tema ainda vive em `src/hooks/useTheme.ts` (não em `shared/hooks`).

## Camada de dados, Provider Pattern e mocks

- **Provider Pattern (PRD-005):** features **nunca** consomem `src/mocks/` diretamente. Acessam dados via `useXxxProvider()` hooks de `@/providers/data`. O `factory.ts` monta `mockProviders`/`supabaseProviders` (33 providers: customers, vehicles, leads, conversations, messages, parts, quotes, orders, commissions, expenses, cashflow, goals, recommendations, transfers, segments, sellers, stores, settings, audits, whatsappAccounts, distributionTraces, managerDashboard, sdrSessions, sdrEscalations, copilot, indicators, vehicleModels, modelKits, media, assetLibrary, quickReply, trackableLink, scheduledSend).
- **Fronteiras impostas por ESLint** (`eslint.config.js`, `no-restricted-imports`): fora de `src/mocks/**` e `src/providers/data/**`, são **proibidos**: import de `@/mocks` / `@/mocks/api/*` (use providers), de módulos internos do mock (`store`/`generators`/`data`/`config`), de `@/providers/data/impl/*`, de `@/providers/data/contracts/*` individuais e de `@/providers/data/factory`. Tudo passa pelo barrel `@/providers/data`. Exceção: `src/routes/design-system.tsx` (usa utilitário de reset de seed).
- **Switch de fonte de dados:** `getDataProviders()` resolve `VITE_DATA_SOURCE=mock|supabase` (default `mock`; valor inválido cai em `mock` com warning em dev). Build-time only — sem troca em runtime. Documentado em `.env.example` e `src/vite-env.d.ts`.
- **Dados determinísticos:** base mock gerada por seed (`seedrandom` + `@faker-js/faker`) — mesmo dataset entre reloads. Volumes/seed em `src/mocks/config.ts`.
- **Auditoria:** mutações registram trilha via `auditLogger` (`recordAuditLog` async / `recordAuditLogSync`).

## Modelo de domínio

Tipos em `src/shared/types/` (barrel em `index.ts`). Interfaces de domínio prefixadas com **`I`**. Principais agrupamentos:

- **platform.ts** — `IStore`, `IPlatformSettings`, `IPipelineStage`, `ILossReason`, `IGamificationRules`, ...
- **people.ts** — `ISeller`, `IRole`, `IPermission`, `IAuditLog`, `ICommissionRule`
- **customer.ts** — `ICustomer` (B2B/B2C), `ICustomerNote`, `ICustomerSegment`
- **lead.ts** — `ILead`, `ILeadStage`, `ICarteiraTransfer`
- **conversation.ts** — `IConversation`, `IMessage`, `IWhatsAppAccount`
- **commercial.ts** — `IOrder`, `IOrderItem`, `IQuote`, `ICommission`
- **catalog.ts** — `IPart`, `IApplication`
- **media.ts / quickSend.ts** — gestão de mídia (PRD-026) e envio rápido/biblioteca de ativos (PRD-027): `IMediaAsset`, `IAssetLibraryItem`, `IQuickReply`, `ITrackableLink`, `IAssetCombo`, `IScheduledSend`
- **dre.ts / expenses.ts / cashflow.ts / inventory.ts / inventory-movement.ts / bi.ts** — financeiro e BI
- **storefront.ts / portal-b2b.ts / visit.ts / distribution.ts / shipping.ts / sdr*.ts / insights.ts** — demais domínios
- **common.ts** — utilitários (`ID`, `ISO8601`, `Money`, `Division`)

Padrões transversais do modelo:

- **Multi-loja desde o modelo** — `IStore` é entidade de primeira classe; toda entidade comercial carrega `storeId`. Seleção de loja via `MultistoreProvider`.
- **Campo `division: 'parts' | 'service' | 'industrial'`** em entidades comerciais — default `parts` no MVP; SERVICE e INDUSTRIAL ficam dormentes mas modeladas.

## Sistema de temas (PRD-001)

Modelagem em **duas dimensões CSS independentes** no `<html>`:

```html
<html data-theme="diesel|parts|service|industrial" data-mode="light|dark"></html>
```

Mais a classe `.dark` (variante Tailwind via `@custom-variant dark (&:is(.dark *))`).

- **Persistência:** `localStorage` chaves `gallo-theme` e `gallo-mode` — constantes em `src/config/themes.ts` (`LOCALSTORAGE_KEYS`). `mode` aceita `auto` (observa `prefers-color-scheme`).
- **Anti-FOUC:** script inline no `<head>` do `index.html` aplica atributos antes do primeiro paint. Se mudar as chaves do localStorage ou os nomes de tema, **atualizar esse script também**.
- **Provider/hook:** `ThemeProvider` em `src/components/ThemeProvider.tsx`, hook em `src/hooks/useTheme.ts`. Acesso de leitura sempre via `useTheme()`.
- **Tokens em 3 camadas** (`src/styles.css`):
  1. **Primitivos** (`:root` — `--gallo-*`): paleta GALLO bruta. Não usar direto em componentes.
  2. **Semânticos** (`@theme inline`): `--background`, `--foreground`, `--primary`, etc. — mapeados para Tailwind/shadcn.
  3. **Tema** (`[data-theme="…"]` + `.dark|.light`): reescreve semânticos.
  - **Componentes consomem APENAS tokens semânticos** (`bg-background`, `text-foreground`, `border-border`…). Nunca referenciar `--gallo-*` ou hex direto. Severidades via utilitários Tailwind `text-/bg-/border-severity-{info|success|warning|critical}`.
- **Rota `/design-system`:** página de visualização de tokens, tipografia, componentes shadcn e validador de contraste WCAG. É **dev-only** (`beforeLoad` chama `redirect({ to: '/' })` quando `!import.meta.env.DEV`).

## Convenções de código

- **camelCase** variáveis/funções, **PascalCase** componentes/tipos, **kebab-case** arquivos, **snake_case** colunas DB (Fase 2), **UPPER_SNAKE_CASE** constantes globais.
- **Comentários:** inglês. **UI/conteúdo de usuário:** português do Brasil com acentos corretos (UTF-8 — nunca `nao`/`avaliacao`/`conclusao`).
- **Commits:** Conventional Commits em inglês (`feat:`, `fix:`, `refactor:`, etc.), atômicos.
- **TypeScript:** `strict: true`. Evitar `any`. Interfaces de domínio prefixadas com `I`.
- `bunfig.toml` impõe **24h supply-chain guard** (`minimumReleaseAge = 86400`). Antes de adicionar pacote à `minimumReleaseAgeExcludes`, **confirmar com o usuário**.

## Fluxo de desenvolvimento dirigido por PRD

Toda implementação substantiva é guiada por um PRD em `docs/prds/`. Documento mestre: `docs/prds/briefing-execucao-prds.md` — modelo conceitual completo (50+ entidades), índice dos PRDs, decisões arquiteturais transversais e estrutura de pastas alvo. Índices/roadmaps adicionais (`INDEX-PRDs-*`, `ROADMAP-FASE2-*`) também vivem nessa pasta.

- ~76 arquivos de PRD em `docs/prds/`; PRDs concluídos são marcados com sufixo **`_DONE`** no nome do arquivo — cobrem Design System, Shell, Provider Pattern, RBAC, multistore, clientes, veículos, leads, orçamentos, pedidos, catálogo, analytics de vendas, ranking/gamificação, positivação, curva ABC, carteira analítica, metas, comissões, DRE, rentabilidade, despesas, fluxo de caixa, estoque, atendimento, SDR, insights, gestão de mídia (PRD-026), envio rápido/biblioteca de ativos (PRD-027), storefront B2C completo (home/busca/categoria/ficha/carrinho/conta/admin), portal B2B e PWA do vendedor externo.
- PRDs da faixa **100+** (`PRD-100`–`PRD-110`) e `PRD-201` tratam de infraestrutura Supabase / Fase 2 e ainda não estão `_DONE`.

Padrões arquiteturais que devem ser preservados ao implementar features:

- **Provider Pattern** — features acessam dados só via `@/providers/data`; switch Mock → Supabase por `VITE_DATA_SOURCE`.
- **Multi-loja** — `IStore` de primeira classe; toda entidade comercial carrega `storeId`.
- **Campo `division`** — `parts` default; `service`/`industrial` modeladas e dormentes.
- **Feature folder** — novo código em `src/features/<feature>/` com barrel `index.ts`; lógica de negócio em `engine/` (testada com Vitest).

## Versionamento e changelog

- **SemVer.** MINOR/MAJOR recebem **codinome em inglês** (atual: `Dispatch` — v0.68.1).
- **CHANGELOG.md** segue Keep a Changelog; atualizado no version bump, não a cada commit. É copiado para `public/` pelos pre-scripts (`scripts/copy-changelog.mjs`).
- Bump após PRD completo (obrigatório) ou quando solicitado para acumulado de fixes diretos.
- **Tags git** acompanham cada bump: `vX.Y.Z` no commit de release/merge (ex.: `v0.67.0` Vault, `v0.68.0` Dispatch, `v0.68.1` Dispatch).
