# Performance Baseline — PRD-108

> Capturado em **2026-06-09** via `pg_stat_statements` (instalada por default no projeto),
> acumulado desde o início da Fase 2 (cutover + smokes + Preview). Dataset: seed de
> demonstração (~4,5 mil linhas em 40 tabelas). Use este snapshot como referência
> antes/depois de futuras otimizações.

## Top consultas por tempo total (excl. ferramentas internas)

| Total (ms) | Calls | Média (ms) | Consulta (PostgREST) |
| ---: | ---: | ---: | --- |
| 58.371 | 6.340 | 9,2 | SELECT `messages` (lista por conversa) |
| 47.796 | 3.120 | 15,3 | SELECT `conversations` (inbox) |
| 43.434 | 3.252 | 13,4 | SELECT `customers` (listas/carteira) |
| 30.905 | 1.301 | 23,8 | SELECT `quote_items` |
| 26.608 | 134 | **198,6** | SELECT `orders` (variante 1) |
| 14.133 | 48 | **294,4** | SELECT `orders` (variante 2) |
| 13.288 | 46 | **288,9** | SELECT `orders` (variante 3) |

Observações:

- **Mensagens/conversas/clientes** dominam o volume (inbox + polling do reconciler antigo) com
  médias saudáveis (< 16 ms) — as policies per-seller com helpers em `(select …)` (InitPlan,
  `perf_initplan_wrap_helpers`) seguram bem essas rotas.
- **`orders` é a família mais cara por chamada** (~200–300 ms): são os SELECTs largos dos
  dashboards de analytics (BI computado no client a partir da tabela crua). É exatamente o
  caso que as **MVs do PRD-108** atacam — `mv_sales_by_seller_month` / `mv_executive_kpis`
  pré-agregam isso e o refresh roda a cada 15 min fora do caminho do usuário.
- Índices: 21 índices de FK (`perf_index_unindexed_fks`) + trgm em `parts.name`,
  `parts.oem_codes_text`, `customers.full_name/razao_social/nome_fantasia` + parcial
  `leads_open_by_seller_idx` (pipeline aberto por vendedor).

## Como re-capturar

```sql
select round(total_exec_time::numeric,1) as total_ms, calls,
       round(mean_exec_time::numeric,2) as mean_ms,
       left(regexp_replace(query, '\s+', ' ', 'g'), 110) as query
from extensions.pg_stat_statements
order by total_exec_time desc limit 20;

-- zerar o acumulado para uma janela limpa:
select extensions.pg_stat_statements_reset();
```
