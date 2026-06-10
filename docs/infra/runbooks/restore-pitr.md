# Runbook — Restauração PITR (Point-In-Time Recovery)

> **Cenário:** deleção acidental em massa, migration destrutiva, corrupção de dados —
> e você sabe (ao menos aproximadamente) **quando** o dano aconteceu.
> **Pré-requisito:** add-on PITR habilitado no projeto (Dashboard → Database →
> Backups → Point in Time). Sem PITR, use o daily backup (mesma tela) ou
> `restore-logical.md`.
> **Impacto:** a restauração PITR do Supabase é **in-place** — o banco INTEIRO volta
> ao ponto escolhido, com downtime durante o processo. Tudo que aconteceu depois do
> timestamp escolhido é perdido (anote antes o que precisar ser reaplicado).

## Antes de começar (5 min)

1. **Pare o tráfego de escrita:** se produção já estiver em `supabase` (pós-#47),
   considere colocar a Vercel em maintenance ou comunicar os usuários. O Preview pode
   simplesmente ser avisado.
2. **Determine o timestamp alvo:** o último instante BOM antes do dano. Fontes:
   - `audit_logs` (tabela `public.audit_logs` — trilha de mutações com timestamp);
   - Supabase Logs Explorer (Dashboard → Logs) filtrando por tabela/erro;
   - horário do deploy/migration suspeito (GitHub Actions / `supabase_migrations.schema_migrations`).
3. **Registre o estado atual** (para o dr-test-log e para reaplicar depois, se possível):
   contagens das tabelas afetadas, último pedido/orçamento criado, etc.

## Restauração (Dashboard)

1. Dashboard → **Database → Backups → Point in Time**.
2. Escolha data/hora (UTC! converta de BRT = UTC−3) do último instante bom.
3. Confirme. O projeto entra em modo de restauração (alguns minutos de downtime,
   proporcional ao tamanho do banco).
4. Aguarde o status voltar a `Healthy`.

## Validação pós-restore (obrigatória)

1. **Integridade RLS/dados:** rodar a suíte de regressão:
   ```bash
   psql "<SUPABASE_DB_URL>" -v ON_ERROR_STOP=1 -f supabase/tests/rls-regression.sql
   ```
   Deve terminar em `ALL RLS REGRESSION TESTS PASSED`.
2. **Contagens:** comparar contagens das tabelas afetadas com o esperado para o
   timestamp escolhido.
3. **Migrations:** conferir `select version from supabase_migrations.schema_migrations
   order by version desc limit 5;` — se a restauração voltou para antes de uma migration
   legítima, reaplicar com `supabase db push` (replay idempotente).
4. **Jobs pg_cron:** `select jobname, active from cron.job;` — devem seguir ativos
   (`reconcile-derived-notifications`, `refresh-bi-matviews`).
5. **Smoke do app:** seguir `docs/db/cutover-smoke-checklist.md` (login, inbox,
   pedidos, mídia).

## Depois

- Reaplicar manualmente (se aplicável) operações legítimas perdidas entre o timestamp
  e o momento do dano (use `audit_logs` registrado no passo "Antes").
- Registrar o incidente e o tempo total em `docs/infra/dr-test-log.md`.
- Se a causa foi migration/bug: abrir issue com post-mortem antes de reativar o fluxo.
