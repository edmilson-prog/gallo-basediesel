---
objeto: product_indicators
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: catalog
rls_enabled: true
colunas: 16
edge_functions: []
prds_relacionados: [PRD-016]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `product_indicators`

> Indicadores/curva de produto por vendedor. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** catalog · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | não | — | FK → `stores.id` |
| 3 | `name` | text | não | — | — |
| 4 | `selector` | jsonb | não | — | — |
| 5 | `metric` | text | não | — | — |
| 6 | `scope_level` | text | não | — | — |
| 7 | `seller_id` | uuid | sim | — | FK → `sellers.id` |
| 8 | `period` | jsonb | não | — | — |
| 9 | `target_value` | numeric | não | — | — |
| 10 | `status` | text | não | — | — |
| 11 | `division` | text | sim | — | — |
| 12 | `reward_description` | text | sim | — | — |
| 13 | `created_by` | text | não | — | — |
| 14 | `cancel_reason` | text | sim | — | — |
| 15 | `created_at` | timestamptz | não | — | — |
| 16 | `updated_at` | timestamptz | não | — | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `seller_id` → `sellers.id`
- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `product_indicators_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `product_indicators_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `product_indicators_select` — SELECT · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `product_indicators_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `product_indicators_pkey` — `CREATE UNIQUE INDEX product_indicators_pkey ON public.product_indicators USING btree (id)`
- `product_indicators_scope_level_idx` — `CREATE INDEX product_indicators_scope_level_idx ON public.product_indicators USING btree (scope_level)`
- `product_indicators_seller_id_idx` — `CREATE INDEX product_indicators_seller_id_idx ON public.product_indicators USING btree (seller_id)`
- `product_indicators_status_idx` — `CREATE INDEX product_indicators_status_idx ON public.product_indicators USING btree (status)`
- `product_indicators_store_id_idx` — `CREATE INDEX product_indicators_store_id_idx ON public.product_indicators USING btree (store_id)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

`❓ pendente` — regras de negócio narrativas (o "porquê") a inferir na Fase 3 / confirmar com o humano.

## Perguntas pendentes

- ❓ A tabela `product_indicators` ainda é usada na prática? (classificada por nome/FK; confirmar uso real e volume de escrita recente.)

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
