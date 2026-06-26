---
objeto: mv_sales_by_seller_month
tipo: materialized_view
schema: public
status: existente
tier: suporte
dominio: bi
rls_enabled: false
colunas: 7
edge_functions: []
prds_relacionados: [PRD-018]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `mv_sales_by_seller_month` (materialized view)

> Vendas mensais por vendedor (pedidos, receita, desconto, cancelados). `🔍 inferido (nome das colunas + RPC de leitura)`

**Status:** existente · **Tier:** suporte · **Domínio:** bi (BI/analytics)

## Descrição

Materialized view de BI. Lida pela aplicação **somente via RPC `SECURITY DEFINER`** `mv_sales_by_seller_month_read()` (escopo por loja aplicado na RPC); refresh agendado por `pg_cron`. `🔍 inferido (factory.ts / CLAUDE.md — MVs lidas via RPCs scoped)`

## Colunas `[mecânico]`

| # | coluna | tipo |
|--:|--------|------|
| 1 | `store_id` | uuid |
| 2 | `seller_id` | uuid |
| 3 | `month` | date |
| 4 | `orders_count` | bigint |
| 5 | `revenue` | numeric |
| 6 | `discount_total` | numeric |
| 7 | `canceled_count` | bigint |

## Perguntas pendentes

- ❓ Confirmar a definição/joins de origem de `mv_sales_by_seller_month` e a periodicidade do refresh (`pg_cron`).

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção. |
