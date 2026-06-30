---
objeto: commissions
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: commercial
rls_enabled: true
colunas: 31
edge_functions: []
prds_relacionados: [PRD-019]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `commissions`

> Comissões de vendas por pedido/vendedor. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** commercial · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | não | — | FK → `stores.id` |
| 3 | `seller_id` | uuid | não | — | FK → `sellers.id` |
| 4 | `order_id` | uuid | não | — | FK → `orders.id` |
| 5 | `base_value` | numeric | não | — | — |
| 6 | `rate` | numeric | não | — | — |
| 7 | `base_rate` | numeric | não | — | — |
| 8 | `base_commission` | numeric | não | — | — |
| 9 | `goal_bonus` | numeric | não | — | — |
| 10 | `total_commission` | numeric | não | — | — |
| 11 | `value` | numeric | não | — | — |
| 12 | `is_split` | boolean | não | `false` | — |
| 13 | `split_details` | jsonb | sim | — | — |
| 14 | `rule_snapshot` | jsonb | sim | — | — |
| 15 | `goal_snapshot` | jsonb | sim | — | — |
| 16 | `period` | text | não | — | — |
| 17 | `closed_in_period` | text | sim | — | — |
| 18 | `approved_at` | timestamptz | sim | — | — |
| 19 | `approved_by` | text | sim | — | — |
| 20 | `paid_at` | timestamptz | sim | — | — |
| 21 | `paid_by` | text | sim | — | — |
| 22 | `dispute_reason` | text | sim | — | — |
| 23 | `disputed_at` | timestamptz | sim | — | — |
| 24 | `dispute_resolution` | text | sim | — | — |
| 25 | `dispute_resolved_by` | text | sim | — | — |
| 26 | `dispute_resolved_at` | timestamptz | sim | — | — |
| 27 | `status` | text | não | — | — |
| 28 | `notes` | text | sim | — | — |
| 29 | `calculated_at` | timestamptz | não | — | — |
| 30 | `created_at` | timestamptz | não | `now()` | — |
| 31 | `updated_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `order_id` → `orders.id`
- `seller_id` → `sellers.id`
- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `commissions_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `commissions_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `commissions_select` — SELECT · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `commissions_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `commissions_created_at_idx` — `CREATE INDEX commissions_created_at_idx ON public.commissions USING btree (created_at DESC)`
- `commissions_order_id_idx` — `CREATE INDEX commissions_order_id_idx ON public.commissions USING btree (order_id)`
- `commissions_period_idx` — `CREATE INDEX commissions_period_idx ON public.commissions USING btree (period)`
- `commissions_pkey` — `CREATE UNIQUE INDEX commissions_pkey ON public.commissions USING btree (id)`
- `commissions_seller_id_idx` — `CREATE INDEX commissions_seller_id_idx ON public.commissions USING btree (seller_id)`
- `commissions_status_idx` — `CREATE INDEX commissions_status_idx ON public.commissions USING btree (status)`
- `commissions_store_id_idx` — `CREATE INDEX commissions_store_id_idx ON public.commissions USING btree (store_id)`
- `commissions_store_period_status_idx` — `CREATE INDEX commissions_store_period_status_idx ON public.commissions USING btree (store_id, period, status)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

`❓ pendente` — regras de negócio narrativas (o "porquê") a inferir na Fase 3 / confirmar com o humano.

## Perguntas pendentes

- _(nenhuma registrada ainda)_

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
