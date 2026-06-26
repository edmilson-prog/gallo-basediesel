---
objeto: customer_segments
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: crm
rls_enabled: true
colunas: 8
edge_functions: []
prds_relacionados: [PRD-009]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `customer_segments`

> Segmentos de clientes. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** crm · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `owner_id` | uuid | não | — | FK → `sellers.id` |
| 3 | `name` | text | não | — | — |
| 4 | `description` | text | sim | — | — |
| 5 | `scope` | text | não | — | — |
| 6 | `filters` | jsonb | não | `'{}'::jsonb` | — |
| 7 | `estimated_size` | integer | sim | — | — |
| 8 | `created_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `owner_id` → `sellers.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `customer_segments_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((owner_id IN ( SELECT sellers.id FROM sellers WHERE (sellers.store_id = ( SELECT current_store_id() AS current_store_id)))) AND (( SELECT is_staff() AS is_staff) OR (owner_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `customer_segments_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((owner_id IN ( SELECT sellers.id FROM sellers WHERE (sellers.store_id = ( SELECT current_store_id() AS current_store_id)))) AND (( SELECT is_staff() AS is_staff) OR (owner_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `customer_segments_select` — SELECT · roles: `{authenticated}`
- **USING:** `((owner_id IN ( SELECT sellers.id FROM sellers WHERE (sellers.store_id = ( SELECT current_store_id() AS current_store_id)))) AND (( SELECT is_staff() AS is_staff) OR (scope = 'shared'::text) OR (owner_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `customer_segments_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((owner_id IN ( SELECT sellers.id FROM sellers WHERE (sellers.store_id = ( SELECT current_store_id() AS current_store_id)))) AND (( SELECT is_staff() AS is_staff) OR (owner_id = ( SELECT current_seller_id() AS current_seller_id))))`
- **WITH CHECK:** `((owner_id IN ( SELECT sellers.id FROM sellers WHERE (sellers.store_id = ( SELECT current_store_id() AS current_store_id)))) AND (( SELECT is_staff() AS is_staff) OR (owner_id = ( SELECT current_seller_id() AS current_seller_id))))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `customer_segments_created_at_idx` — `CREATE INDEX customer_segments_created_at_idx ON public.customer_segments USING btree (created_at)`
- `customer_segments_owner_id_idx` — `CREATE INDEX customer_segments_owner_id_idx ON public.customer_segments USING btree (owner_id)`
- `customer_segments_pkey` — `CREATE UNIQUE INDEX customer_segments_pkey ON public.customer_segments USING btree (id)`
- `customer_segments_scope_idx` — `CREATE INDEX customer_segments_scope_idx ON public.customer_segments USING btree (scope)`

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
