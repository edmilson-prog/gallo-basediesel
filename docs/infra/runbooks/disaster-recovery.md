# Runbook — Disaster Recovery total (failover de projeto)

> **Cenário extremo:** o projeto Supabase está irrecuperável — indisponibilidade
> prolongada da plataforma, conta comprometida, ou região fora do ar. Este runbook
> recria TUDO em um projeto novo a partir dos backups externos (GitHub) e do Git.
> **RTO alvo:** < 4 h. **RPO real:** último backup semanal (lógico + storage) — com
> PITR/daily o cenário preferido é sempre `restore-pitr.md` (mesmo projeto).
>
> ⚠️ Antes de declarar desastre: conferir https://status.supabase.com e o Dashboard.
> Failover total é a ÚLTIMA opção — só quando o projeto original não volta em tempo
> aceitável.

## Pré-requisitos (ter à mão)

- Acesso à conta GitHub (artifacts de backup + repositório).
- Acesso à conta Vercel (env vars + redeploy).
- Acesso a UMA conta Supabase utilizável (a original ou uma reserva).
- Chave da conta Resend (ou criar nova) para o convite por e-mail.

## Fase 1 — Provisionar (15–30 min)

1. Criar projeto Supabase novo, região `sa-east-1`, plano Pro.
2. Anotar: project ref, DB password, anon/publishable key, service role key.
3. Habilitar extensões usadas: `pg_cron`, `pg_trgm` (Dashboard → Database →
   Extensions) — `pgcrypto`/`uuid-ossp` já vêm habilitadas.

## Fase 2 — Restaurar dados (30–60 min)

Seguir `restore-logical.md` (dump mais recente) — inclui schema `public`, usuários
(`auth`) e metadata de Storage. Em seguida `restore-storage.md` (arquivos).

> Se o desastre for "conta comprometida": **trocar TODAS as credenciais** antes de
> restaurar (GitHub secrets, Resend, Vercel) — runbook `docs/infra/rotate-keys.md`.

## Fase 3 — Reconfigurar plataforma (30 min)

Checklist de `docs/infra/supabase-setup.md` § "Recriar o ambiente do zero":

- [ ] Auth hook (Custom Access Token JWT Claims → `public.custom_access_token_hook`)
- [ ] Edge Functions deployadas (7 pastas em `supabase/functions/`)
- [ ] Secrets das functions: `RESEND_API_KEY`, `RESEND_FROM`, `INVITE_REDIRECT_URL`
      (+ `SENTRY_DSN` se em uso)
- [ ] Allowlist de redirect URLs (Authentication → URL Configuration):
      `https://gallobasediesel.com.br/auth/definir-senha` (+ Preview se necessário)
- [ ] Jobs pg_cron presentes (`select jobname from cron.job;`) — senão, reaplicar as
      migrations que os criam
- [ ] RLS regression PASSED (`supabase/tests/rls-regression.sql`)

## Fase 4 — Cutover do app (15–30 min)

1. Vercel → Environment Variables (Production e Preview):
   - `VITE_SUPABASE_URL` → URL do projeto novo
   - `VITE_SUPABASE_PUBLISHABLE_KEY` → key nova
2. Redeploy (Production e Preview).
3. Atualizar GitHub secrets de CI/backup: `SUPABASE_DB_URL`, `SUPABASE_PROJECT_REF`,
   `SUPABASE_DB_PASSWORD`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
4. DNS: não há mudança (o domínio aponta para a Vercel, não para o Supabase).

## Fase 5 — Validar e comunicar (30 min)

1. Smoke completo: `docs/db/cutover-smoke-checklist.md` (login, claims, inbox,
   pedidos, mídia com signed URL, convite por e-mail).
2. Comunicar usuários (downtime encerrado + janela de dados perdidos = desde o último
   backup semanal).
3. Registrar o incidente em `docs/infra/dr-test-log.md`: linha do tempo, RTO real,
   dados perdidos (RPO real), causas, ações de melhoria.
4. Disparar manualmente os dois workflows de backup contra o projeto novo
   (Actions → Run workflow) para estabelecer a primeira cópia fria pós-failover.

## Ordem de prioridade se o tempo apertar

1. Banco `public` restaurado + app no ar em modo leitura (RTO do negócio);
2. Usuários (`auth`) — senhas são hashes, logins voltam a funcionar;
3. Storage (mídias chegam depois — a UI degrada graciosamente para metadata);
4. Convite por e-mail / Sentry / pg_cron (operacional, não bloqueia uso).
