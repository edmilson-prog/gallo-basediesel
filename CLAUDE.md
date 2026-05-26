# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

**GALLO BASE DIESEL** — Plataforma SaaS de inteligência comercial para distribuidora de peças pesadas (Volvo, Scania, Mercedes-Benz, Ford Cargo, Iveco) em Frederico Westphalen/RS. A plataforma se posiciona **acima do ERP DINTEC** como cérebro comercial e relacional. Marca guarda-chuva com 3 submarcas: PARTS (verde), SERVICE (vermelho), INDUSTRIAL (amarelo).

Estado atual: **Fase 1 (Frontend First)** — mockup navegável com dados fictícios. PRD-001 (Design System) implementado, codinome `Genesis` (v0.1.0). Demais PRDs (002–071) a serem executados via Claude Code CLI sobre o scaffold inicial. Projeto mantido pela AILA Sistemas Inteligentes.

## Comandos

```bash
bun install          # instalar dependências (bun.lock presente)
bun run dev          # dev server (Vite + TanStack Start)
bun run build        # build de produção
bun run build:dev    # build em modo development
bun run preview      # preview do build
bun run lint         # ESLint
bun run format       # Prettier --write
```

Não há suite de testes configurada. Type-check é coberto pelo `noEmit` do `tsc` via `bun run build`.

## Stack e arquitetura

- **Modelo de deploy:** SPA estática hospedada na Vercel. `index.html` na raiz é o template Vite; `vercel.json` faz rewrite de todas as rotas para `/index.html` (padrão SPA).
- **Entry:** `src/main.tsx` faz `createRoot` em `#root` e renderiza `<RouterProvider>`. Não há SSR.
- **Vite config:** plugins explícitos em `vite.config.ts` — `tanstackRouter` (com `autoCodeSplitting`), `react`, `tailwindcss`, `tsconfigPaths`. Sem framework wrapper opinionado por trás.
- **Router:** TanStack Router file-based (sem TanStack Start). Rotas em `src/routes/`; `routeTree.gen.ts` é **gerado** pelo plugin (não editar). Root route em `src/routes/__root.tsx` define `<RootComponent>` com `QueryClientProvider` + `ThemeProvider` + `<Outlet>`. Meta tags, Google Fonts, favicons e script anti-FOUC vivem no `index.html`.
- **UI:** Tailwind CSS **v4** + shadcn/ui (style `new-york`, baseColor `slate`) em `src/components/ui/`. Iconify (`@iconify/react`) é o ícone padrão; wrapper em `src/components/Icon.tsx`.
- **Estado servidor:** TanStack Query — `QueryClient` criado em `src/router.tsx` e injetado via router context.
- **Formulários:** react-hook-form + zod + `@hookform/resolvers`.
- **Toasts:** sonner.
- **Path alias:** `@/*` → `src/*` (definido em `tsconfig.json` e `components.json`).

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
  - **Componentes consomem APENAS tokens semânticos** (`bg-background`, `text-foreground`, `border-border`…). Nunca referenciar `--gallo-*` ou hex direto.
- **Rota `/design-system`:** página de visualização de tokens, tipografia, componentes shadcn e validador de contraste WCAG. É **dev-only** (`beforeLoad` chama `redirect({ to: '/' })` quando `!import.meta.env.DEV`).

## Convenções de código (CLAUDE.md global)

- **camelCase** variáveis/funções, **PascalCase** componentes/tipos, **kebab-case** arquivos, **snake_case** colunas DB (Fase 2), **UPPER_SNAKE_CASE** constantes globais.
- **Comentários:** inglês. **UI/conteúdo de usuário:** português do Brasil com acentos corretos (UTF-8 — nunca `nao`/`avaliacao`/`conclusao`).
- **Commits:** Conventional Commits em inglês (`feat:`, `fix:`, `refactor:`, etc.), atômicos.
- **TypeScript:** `strict: true`. Evitar `any`. Prefixar interfaces de domínio com `I` (ver modelo conceitual no briefing — `IStore`, `ISeller`, `ICustomer`, etc.).
- `bunfig.toml` impõe **24h supply-chain guard** (`minimumReleaseAge = 86400`). Antes de adicionar pacote à `minimumReleaseAgeExcludes`, **confirmar com o usuário**.

## Fluxo de desenvolvimento dirigido por PRD

Toda implementação substantiva é guiada por um PRD em `docs/prds/`. Documento mestre: `docs/prds/briefing-execucao-prds.md` (v1.1) — contém modelo conceitual completo (50+ entidades), índice dos 50 PRDs, decisões arquiteturais transversais e estrutura de pastas alvo.

Padrões arquiteturais que devem ser preservados ao implementar features:

- **Provider Pattern** — abstrações como `IWhatsAppProvider` com implementações concretas. Switch via env (ex.: `VITE_DATA_SOURCE=mock|supabase`). Drop-in replacement Mock → Supabase planejado para Fase 2.
- **Multi-loja desde o modelo** — `IStore` é entidade de primeira classe; toda entidade comercial carrega `storeId`.
- **Campo `division: 'parts' | 'service' | 'industrial'`** em entidades comerciais — default `parts` no MVP; SERVICE e INDUSTRIAL ficam dormentes mas modeladas.
- **Estrutura alvo** (ainda não materializada): `src/features/<feature>/`, `src/mocks/`, `src/providers/`, `src/shared/`. Atual scaffold inicial vive em `src/components/`, `src/hooks/`, `src/lib/`, `src/config/`, `src/routes/`.

## Versionamento e changelog

- **SemVer.** MINOR/MAJOR recebem **codinome em inglês** (atual: `Logistics` — v0.24.0).
- **CHANGELOG.md** segue Keep a Changelog; atualizado no version bump, não a cada commit.
- Bump após PRD completo (obrigatório) ou quando solicitado para acumulado de fixes diretos.
