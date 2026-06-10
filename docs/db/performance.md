# Performance — PRD-108 (estado e decisões)

> Atualizado em 2026-06-09. Baseline numérico: `docs/db/performance-baseline.md`.

## O que está implementado

### Policies RLS otimizadas (core, feito antes desta rodada)
- Helpers de identidade (`current_store_id()` / `current_seller_id()` / `is_staff()`) sempre
  embrulhados em `(select …)` → viram **InitPlan** (1 avaliação por query, não por linha).
  Migrations: `perf_initplan_wrap_helpers`, `profiles_select_consolidate_initplan`.
- Identidade lida **direto do JWT** (sem subquery em `profiles`): `rls_helpers_drop_profiles_fallback`.
- **21 índices de FK** cobrindo todas as foreign keys: `perf_index_unindexed_fks`.

### Busca textual indexada (`perf_108_trgm_matviews`)
- Extensão **`pg_trgm`** (autorizada pelo dono) no schema `extensions`.
- GIN trgm: `parts.name`, `parts.oem_codes_text`, `customers.full_name`,
  `customers.razao_social`, `customers.nome_fantasia` — ILIKE/similaridade indexados.
- Índice parcial `leads_open_by_seller_idx (seller_id, updated_at desc)` para o pipeline
  aberto (`converted_to_customer_id is null and loss_reason is null`).

### Views materializadas de BI (`perf_108_trgm_matviews`)
| MV | Grão | Conteúdo |
| --- | --- | --- |
| `mv_sales_by_seller_month` | loja × vendedor × mês | pedidos, receita, descontos, cancelados |
| `mv_commissions_by_period` | loja × vendedor × período × status | contagem + total de comissões |
| `mv_executive_kpis` | loja × mês | pedidos, receita, clientes ativos, ticket médio |

- **Refresh**: job `refresh-bi-matviews` no `pg_cron`, `*/15 * * * *`, com
  `REFRESH MATERIALIZED VIEW CONCURRENTLY` (leitores nunca bloqueiam; exige os unique
  indexes `mv_*_pk`). **Defasagem máxima: 15 min** — aceitável para dashboards gerenciais.
- **Segurança**: MVs não suportam RLS → `SELECT` revogado de `anon`/`authenticated`; a
  leitura passa pelas RPCs `mv_*_read()` (SECURITY DEFINER, `search_path` fixo) que
  reaplicam o escopo com os mesmos helpers das policies: staff vê a loja; vendedor só as
  próprias linhas; KPIs executivos são staff-only. Validado por impersonação
  (cross-seller = 0; SELECT direto na MV = `insufficient_privilege`; anon sem EXECUTE).
  Os 3 WARNs `authenticated_security_definer_function_executable` do advisor são
  **intencionais e aceitos** (mesmo padrão das RPCs anon do storefront).
- **Consumo no app**: os dashboards seguem computando dos providers (sem mudança = sem
  regressão). Quando um dashboard precisar de mais volume, troque a fonte por
  `supabase.rpc("mv_executive_kpis_read")` etc. — wiring deliberadamente não feito nesta
  rodada.

## Deferido conscientemente (com motivo)

| Item do PRD | Status | Motivo |
| --- | --- | --- |
| Cursor pagination (messages/audit/orders) | ❌ deferido | Alto toque nos 34 providers para dataset pequeno (offset atual é barato); rever quando alguma lista passar de ~50k linhas |
| Cache no provider (TTL + invalidação) | ❌ deferido | TanStack Query já cacheia no client; cache adicional duplicaria invalidação. Rever junto com o épico realtime completo |
| Testes de carga k6 | ❌ deferido | Sem perfil de tráfego real ainda (pré-go-live); rodar quando o flip (#47) acontecer |
| Connection pooling tuning (Supavisor) | ❌ deferido | Defaults do Supabase suficientes para o volume atual |

## Rotina de manutenção

1. Após mudanças de schema/policies: `get_advisors` (security + performance) — zero novos alertas.
2. Mensal (ou após mudança de carga): re-capturar o top do `pg_stat_statements` e comparar
   com `performance-baseline.md`.
3. MVs novas: sempre `unique index` + revoke + RPC scoped + entrada no job de refresh.
