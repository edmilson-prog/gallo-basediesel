# Runbook — Setup do projeto Supabase (PRD-100)

> Estado real em 2026-06-09: **projeto único** `njizaasajkdqptlxddqn` (região São Paulo),
> com o Preview da Vercel fazendo o papel de staging do frontend. A previsão original de
> dois projetos (staging+prod) foi adiada — registrado em `docs/db/schema-overview.md`.

## O que já está provisionado

| Item | Estado |
| --- | --- |
| Projeto Supabase | `njizaasajkdqptlxddqn` (Pro) |
| Schema | `public` — 40 tabelas, todas com RLS (ver `docs/db/schema-overview.md`) |
| Auth | E-mail/senha; **Custom Access Token Hook habilitado** (claims role/seller_id/store_id) |
| Edge Functions | `invite-seller`, `invite-seller-email`, `reset-seller-password`, `set-seller-access`, `set-seller-role` (todas `verify_jwt:true`) |
| Extensões | `pg_cron` (reconciler de notificações), `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault` |
| Seed | `scripts/seed-supabase.ts` (usa `SUPABASE_SERVICE_ROLE_KEY` do `.env.local`) |

## Variáveis de ambiente (frontend)

Definidas em `.env.example` / Vercel:

```
VITE_DATA_SOURCE=mock|supabase      # default mock (produção segue mock até o flip, issue #47)
VITE_AUTH_SOURCE=mock|supabase
VITE_SUPABASE_URL=…
VITE_SUPABASE_PUBLISHABLE_KEY=…
```

⚠️ `SUPABASE_SERVICE_ROLE_KEY` **nunca** vai para o browser: vive só em `.env.local`
(sem prefixo `VITE_`, gitignored) e nos secrets das Edge Functions.

## Recriar o ambiente do zero (disaster ou novo projeto)

1. Criar projeto Supabase (região `sa-east-1`).
2. Aplicar migrations: `supabase link --project-ref <ref> && supabase db push`
   (replay completo de `supabase/migrations/` — as policies POC do início são
   substituídas pelas finais durante o replay).
3. Habilitar o hook: Dashboard → Authentication → Hooks → *Customize Access Token (JWT)
   Claims* → `public.custom_access_token_hook`.
4. Deployar Edge Functions: `supabase functions deploy <nome>` para cada pasta em
   `supabase/functions/` (ou via MCP `deploy_edge_function`).
5. Secrets das functions: `RESEND_API_KEY`, `RESEND_FROM`, `INVITE_REDIRECT_URL`
   (convite por e-mail — issue #46).
6. Seed de demonstração (opcional): `bun run scripts/seed-supabase.ts`.
7. Smoke: `psql <db-url> -f supabase/tests/rls-regression.sql` deve terminar em
   `ALL RLS REGRESSION TESTS PASSED`; depois seguir `docs/db/cutover-smoke-checklist.md`.

## CI (gated — issue #45)

| Workflow | Dispara | Secrets necessários |
| --- | --- | --- |
| `rls-tests.yml` | PR tocando `supabase/tests/**` | `SUPABASE_DB_URL` |
| `db-deploy.yml` | push em `main` tocando `supabase/migrations/**` | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` |
| `gen-types.yml` | PR tocando migrations/tipos | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` |

Todos são **no-op verdes** até os secrets existirem — adicionar os secrets é a única ativação necessária.
