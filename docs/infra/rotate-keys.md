# Runbook — Rotação de chaves e segredos (PRD-100)

> Use este runbook em suspeita de vazamento ou na rotação periódica (recomendado: semestral).

## Inventário de segredos

| Segredo | Onde vive | Exposição |
| --- | --- | --- |
| `VITE_SUPABASE_PUBLISHABLE_KEY` (anon/publishable) | `.env.local`, Vercel env, browser | **Pública por design** — segurança vem da RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` (gitignored), secrets de Edge Functions | **CRÍTICA — bypassa RLS.** Nunca em código, nunca com prefixo `VITE_` |
| `SUPABASE_ACCESS_TOKEN` (PAT) | GitHub Actions secrets | Gerencia o projeto via CLI |
| `SUPABASE_DB_PASSWORD` / `SUPABASE_DB_URL` | GitHub Actions secrets | Acesso direto ao Postgres |
| `RESEND_API_KEY` (quando ativado, #46) | Secrets de Edge Functions | Envio de e-mail |

## Rotacionar as API keys do Supabase (anon + service_role)

1. Dashboard → Settings → API → **Rotate** (gera novo par; o antigo continua válido por curto período).
2. Atualizar, **nesta ordem** (minimiza janela de erro):
   1. Secrets das Edge Functions (`supabase secrets set SUPABASE_SERVICE_ROLE_KEY=…` — ou Dashboard).
   2. `.env.local` local (`SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`).
   3. Vercel → Settings → Environment Variables (`VITE_SUPABASE_PUBLISHABLE_KEY`) em **todos os escopos** (Production/Preview) + redeploy.
3. Revogar a chave antiga no Dashboard.
4. Smoke: login no app (auth supabase), uma leitura no `/app`, uma chamada de Edge Function
   (ex.: tela Usuários → status de acesso).

## Rotacionar a senha do banco

1. Dashboard → Settings → Database → **Reset database password**.
2. Atualizar `SUPABASE_DB_PASSWORD` e `SUPABASE_DB_URL` nos GitHub Actions secrets.
3. Disparar `rls-tests.yml` manualmente (workflow_dispatch) para validar a conexão.

## Rotacionar o PAT (access token)

1. Dashboard de conta → Access Tokens → revogar o antigo, gerar novo.
2. Atualizar `SUPABASE_ACCESS_TOKEN` no GitHub.
3. Disparar `gen-types.yml` manualmente para validar.

## Em caso de vazamento confirmado do service_role

1. Rotacionar **imediatamente** (passos acima) — o service_role bypassa RLS.
2. Auditar: Dashboard → Logs (API/Postgres) por janelas de uso anômalo.
3. Verificar `audit_logs` e dados sensíveis; considerar reset de senhas de usuários.
4. Registrar o incidente e a causa raiz neste arquivo (seção de histórico abaixo).

## Histórico de rotações

| Data | O quê | Motivo | Quem |
| --- | --- | --- | --- |
| — | — | — | — |
