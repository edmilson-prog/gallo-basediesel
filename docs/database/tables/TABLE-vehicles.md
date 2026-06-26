---
objeto: vehicles
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: vehicles
rls_enabled: true
colunas: 13
edge_functions: []
prds_relacionados: [PRD-007]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `vehicles`

> Veículo de um cliente. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** vehicles · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `customer_id` | uuid | não | — | FK → `customers.id` |
| 3 | `brand` | text | não | — | — |
| 4 | `model` | text | não | — | — |
| 5 | `year` | integer | não | — | — |
| 6 | `engine` | text | não | — | — |
| 7 | `model_id` | text | sim | — | — |
| 8 | `plate` | text | sim | — | — |
| 9 | `vin` | text | sim | — | — |
| 10 | `current_km` | integer | sim | — | — |
| 11 | `service_history` | jsonb | não | `'[]'::jsonb` | — |
| 12 | `cadastro_status` | text | não | — | — |
| 13 | `created_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `customer_id` → `customers.id`

**Entrando (referenciam esta tabela):**

- `media_assets.linked_vehicle_id` → `vehicles.id`
- `order_items.applied_to_vehicle_id` → `vehicles.id`

## RLS — Row Level Security `[regra: mecânico]`

### `vehicles_delete` — DELETE · roles: `{authenticated}`
- **USING:** `(customer_id IN ( SELECT customers.id FROM customers WHERE (customers.store_id = ( SELECT current_store_id() AS current_store_id))))`

### `vehicles_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `(customer_id IN ( SELECT customers.id FROM customers WHERE (customers.store_id = ( SELECT current_store_id() AS current_store_id))))`

### `vehicles_select` — SELECT · roles: `{authenticated}`
- **USING:** `(customer_id IN ( SELECT customers.id FROM customers WHERE (customers.store_id = ( SELECT current_store_id() AS current_store_id))))`

### `vehicles_update` — UPDATE · roles: `{authenticated}`
- **USING:** `(customer_id IN ( SELECT customers.id FROM customers WHERE (customers.store_id = ( SELECT current_store_id() AS current_store_id))))`
- **WITH CHECK:** `(customer_id IN ( SELECT customers.id FROM customers WHERE (customers.store_id = ( SELECT current_store_id() AS current_store_id))))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `vehicles_brand_idx` — `CREATE INDEX vehicles_brand_idx ON public.vehicles USING btree (brand)`
- `vehicles_cadastro_status_idx` — `CREATE INDEX vehicles_cadastro_status_idx ON public.vehicles USING btree (cadastro_status)`
- `vehicles_created_at_idx` — `CREATE INDEX vehicles_created_at_idx ON public.vehicles USING btree (created_at)`
- `vehicles_customer_id_idx` — `CREATE INDEX vehicles_customer_id_idx ON public.vehicles USING btree (customer_id)`
- `vehicles_pkey` — `CREATE UNIQUE INDEX vehicles_pkey ON public.vehicles USING btree (id)`

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
