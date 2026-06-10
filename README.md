# GALLO BASE DIESEL

Plataforma SaaS de inteligência comercial para distribuidora de peças pesadas
(Volvo, Scania, Mercedes-Benz, Ford Cargo, Iveco) — posicionada acima do ERP
como cérebro comercial e relacional. Mantida pela **AILA Sistemas
Inteligentes**.

## Stack

SPA estática (Vercel) — Vite + React 19 + TypeScript strict, TanStack
Router/Query, Tailwind v4 + shadcn/ui, Zustand, Supabase (Auth, Postgres+RLS,
Storage, Edge Functions, Realtime).

## Comandos

```bash
bun install          # dependências
bun run dev          # dev server
bun run build        # build de produção (não faz type-check — use bunx tsc --noEmit)
bun run test         # Vitest
bun run lint         # ESLint
```

## Modo dev: mock vs supabase

A fonte de dados é decidida **em build** por `VITE_DATA_SOURCE` (`.env.local`):

- `mock` (default) — dataset fictício determinístico (faker + seed) em memória.
  Demo completa sem backend; o "tempo real" do Inbox é um simulador.
- `supabase` — todos os providers falam com o Supabase real (RLS, Realtime,
  Storage, Edge Functions). Requer `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_PUBLISHABLE_KEY` e, para auth real, `VITE_AUTH_SOURCE=supabase`.

Troque o valor e **reinicie o dev server** (não há troca em runtime). As
features nunca importam mocks diretamente — tudo passa pelo Provider Pattern
(`@/providers/data`); a fronteira é imposta por ESLint. Detalhes:
`docs/provider-pattern.md` e `docs/dev/onda5-migration.md` (PRD-119).

## Documentação

- `CLAUDE.md` — visão geral de arquitetura e convenções (fonte da verdade).
- `docs/prds/` — PRDs (concluídos levam sufixo `_DONE`).
- `docs/dev/` — guias técnicos (WhatsApp, Supabase, templates, DR/observabilidade).
- `CHANGELOG.md` — histórico de versões (Keep a Changelog, SemVer).
