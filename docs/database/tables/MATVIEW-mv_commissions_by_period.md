---
objeto: mv_commissions_by_period
tipo: materialized_view
schema: public
status: existente
tier: suporte
dominio: bi
rls_enabled: false
colunas: 6
edge_functions: []
prds_relacionados: [PRD-018]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `mv_commissions_by_period` (materialized view)

> Comissões agregadas por loja/vendedor/período/status. `🔍 inferido (nome das colunas + RPC de leitura)`

**Status:** existente · **Tier:** suporte · **Domínio:** bi (BI/analytics)

## Descrição

Materialized view de BI. Lida pela aplicação **somente via RPC `SECURITY DEFINER`** `mv_commissions_by_period_read()` (escopo por loja aplicado na RPC); refresh agendado por `pg_cron`. `🔍 inferido (factory.ts / CLAUDE.md — MVs lidas via RPCs scoped)`

## Colunas `[mecânico]`

| # | coluna | tipo |
|--:|--------|------|
| 1 | `store_id` | uuid |
| 2 | `seller_id` | uuid |
| 3 | `period` | text |
| 4 | `status` | text |
| 5 | `commissions_count` | bigint |
| 6 | `total_amount` | numeric |

## Perguntas pendentes

- ❓ Confirmar a definição/joins de origem de `mv_commissions_by_period` e a periodicidade do refresh (`pg_cron`).

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção. |
