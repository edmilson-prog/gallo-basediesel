---
objeto: order_items
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: commercial
rls_enabled: true
colunas: 14
edge_functions: []
prds_relacionados: [PRD-015]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `order_items`

> Item de um pedido (filho de orders). `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** commercial · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `order_id` | uuid | não | — | FK → `orders.id` ‹on delete cascade› |
| 3 | `part_id` | uuid | não | — | FK → `parts.id` |
| 4 | `part_sku` | text | não | — | — |
| 5 | `part_name` | text | não | — | — |
| 6 | `quantity` | numeric | não | — | — |
| 7 | `unit_price` | numeric | não | — | — |
| 8 | `unit_cost` | numeric | não | — | — |
| 9 | `discount` | numeric | não | — | — |
| 10 | `total` | numeric | não | — | — |
| 11 | `margin_value` | numeric | não | — | — |
| 12 | `applied_to_vehicle_id` | uuid | sim | — | FK → `vehicles.id` |
| 13 | `part_category` | text | sim | — | — |
| 14 | `part_subcategory` | text | sim | — | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `applied_to_vehicle_id` → `vehicles.id`
- `order_id` → `orders.id` — on delete `CASCADE`
- `part_id` → `parts.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `order_items_delete` — DELETE · roles: `{authenticated}`
- **USING:** `(order_id IN ( SELECT orders.id FROM orders WHERE (orders.store_id = ( SELECT current_store_id() AS current_store_id))))`

### `order_items_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `(order_id IN ( SELECT orders.id FROM orders WHERE (orders.store_id = ( SELECT current_store_id() AS current_store_id))))`

### `order_items_select` — SELECT · roles: `{authenticated}`
- **USING:** `(order_id IN ( SELECT orders.id FROM orders WHERE (orders.store_id = ( SELECT current_store_id() AS current_store_id))))`

### `order_items_update` — UPDATE · roles: `{authenticated}`
- **USING:** `(order_id IN ( SELECT orders.id FROM orders WHERE (orders.store_id = ( SELECT current_store_id() AS current_store_id))))`
- **WITH CHECK:** `(order_id IN ( SELECT orders.id FROM orders WHERE (orders.store_id = ( SELECT current_store_id() AS current_store_id))))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `order_items_applied_to_vehicle_id_idx` — `CREATE INDEX order_items_applied_to_vehicle_id_idx ON public.order_items USING btree (applied_to_vehicle_id)`
- `order_items_order_id_idx` — `CREATE INDEX order_items_order_id_idx ON public.order_items USING btree (order_id)`
- `order_items_part_id_idx` — `CREATE INDEX order_items_part_id_idx ON public.order_items USING btree (part_id)`
- `order_items_pkey` — `CREATE UNIQUE INDEX order_items_pkey ON public.order_items USING btree (id)`

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
