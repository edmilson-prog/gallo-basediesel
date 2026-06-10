# Runbook — Restauração a partir do backup lógico (pg_dump)

> **Cenário:** recriar o banco em um projeto NOVO a partir do dump semanal — porque o
> projeto original foi perdido/comprometido, ou para um teste anual de DR.
> **Fonte:** artifact `gallo-logical-backup-<stamp>.dump` do workflow
> **Logical backup** (GitHub → Actions → Logical backup → run mais recente →
> Artifacts). Retenção: 90 dias.
> **Conteúdo do dump:** schemas `public` (negócio), `auth` (usuários), `storage`
> (metadata de objetos) e `supabase_migrations` (histórico), formato custom,
> `--no-owner --no-privileges`. Os **arquivos** do Storage vêm de
> `restore-storage.md` (backup separado).

## 1. Baixar e validar o dump (5 min)

```bash
# baixar pelo navegador (Actions → artifact) ou via gh CLI:
gh run list --workflow=logical-backup.yml --limit 5
gh run download <run-id>

pg_restore --list gallo-logical-backup-<stamp>.dump | head   # deve listar sem erro
```

## 2. Provisionar o projeto destino

1. Criar projeto Supabase (região `sa-east-1`), plano Pro.
2. Anotar: project ref, DB password, connection string (`<NEW_DB_URL>`).
3. **Não** aplicar migrations antes do restore — o dump já carrega o schema `public`
   completo e o histórico em `supabase_migrations` (evita conflito de objetos).

## 3. Restaurar

Ordem importa: `public` (schema+dados) → `auth`/`storage` (somente dados, os schemas
são geridos pela plataforma e já existem no projeto novo).

```bash
# 3a. Schema de negócio completo (estrutura + dados + RLS + functions + triggers)
pg_restore "$NEW_DB_URL" --no-owner --no-privileges \
  --schema=public --schema=supabase_migrations \
  gallo-logical-backup-<stamp>.dump

# 3b. Usuários (somente dados — o schema auth é gerido pelo GoTrue)
pg_restore "$NEW_DB_URL" --no-owner --no-privileges \
  --data-only --disable-triggers --schema=auth \
  gallo-logical-backup-<stamp>.dump

# 3c. Metadata do Storage (buckets/objects — os bytes vêm do restore-storage)
pg_restore "$NEW_DB_URL" --no-owner --no-privileges \
  --data-only --disable-triggers --schema=storage \
  gallo-logical-backup-<stamp>.dump
```

Notas:

- `--disable-triggers` exige role com privilégio suficiente (use a connection string
  do role `postgres`).
- Erros de `already exists` em 3b/3c para linhas seed da plataforma (ex.: bucket vazio
  criado por engano) podem ser ignorados pontualmente — revisar um a um.
- Se 3a acusar extensões ausentes (`pg_trgm`, `pg_cron`): habilitar no Dashboard
  (Database → Extensions) e repetir.

## 4. Reconfigurar a plataforma (o que NÃO vai no dump)

Seguir `docs/infra/supabase-setup.md` § "Recriar o ambiente do zero", em especial:

1. **Auth hook:** Dashboard → Authentication → Hooks → Customize Access Token (JWT)
   Claims → `public.custom_access_token_hook`.
2. **Edge Functions:** deploy das 7 pastas de `supabase/functions/` + secrets
   (`RESEND_API_KEY`, `RESEND_FROM`, `INVITE_REDIRECT_URL`, `SENTRY_DSN` opcional).
3. **pg_cron:** conferir `select jobname from cron.job;` — se os jobs não vieram no
   restore, reaplicar as migrations que os criam (`notifications_*`, `perf_108_*`).
4. **Auth settings:** allowlist de redirect URLs (`/auth/definir-senha`), SMTP/e-mail.
5. **Storage:** restaurar arquivos (`restore-storage.md`).

## 5. Religar o app

1. Vercel → Settings → Environment Variables: `VITE_SUPABASE_URL` e
   `VITE_SUPABASE_PUBLISHABLE_KEY` do projeto novo → redeploy.
2. Edge secrets / GitHub secrets que referenciam o ref antigo: atualizar.

## 6. Validação (obrigatória)

```bash
psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls-regression.sql
```

- `ALL RLS REGRESSION TESTS PASSED`;
- contagens de `customers`, `orders`, `conversations` ≈ esperado;
- login real + smoke `docs/db/cutover-smoke-checklist.md`;
- registrar tempo total e problemas em `docs/infra/dr-test-log.md`.
