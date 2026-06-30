---
objeto: mv_executive_kpis
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

# `mv_executive_kpis` (materialized view)

> KPIs executivos mensais por loja (pedidos, receita, clientes, ticket). `🔍 inferido (nome das colunas + RPC de leitura)`

**Status:** existente · **Tier:** suporte · **Domínio:** bi (BI/analytics)

## Descrição

Materialized view de BI. Lida pela aplicação **somente via RPC `SECURITY DEFINER`** `mv_executive_kpis_read()` (escopo por loja aplicado na RPC); refresh agendado por `pg_cron`. `🔍 inferido (factory.ts / CLAUDE.md — MVs lidas via RPCs scoped)`

## Colunas `[mecânico]`

| # | coluna | tipo |
|--:|--------|------|
| 1 | `store_id` | uuid |
| 2 | `month` | date |
| 3 | `orders_count` | bigint |
| 4 | `revenue` | numeric |
| 5 | `active_customers` | bigint |
| 6 | `avg_ticket` | numeric |

## Perguntas pendentes

- ❓ Confirmar a definição/joins de origem de `mv_executive_kpis` e a periodicidade do refresh (`pg_cron`).

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção. |
