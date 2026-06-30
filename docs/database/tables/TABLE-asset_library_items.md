---
objeto: asset_library_items
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: media
rls_enabled: true
colunas: 19
edge_functions: []
prds_relacionados: [PRD-027]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `asset_library_items`

> Biblioteca de ativos reutilizáveis. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** media · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | não | — | FK → `stores.id` |
| 3 | `division` | text | não | `'parts'::text` | — |
| 4 | `title` | text | não | — | — |
| 5 | `category` | text | não | — | — |
| 6 | `brand` | text | sim | — | — |
| 7 | `product_line` | text | sim | — | — |
| 8 | `kind` | text | não | — | — |
| 9 | `storage_ref` | text | sim | — | — |
| 10 | `media_asset_id` | text | sim | — | — |
| 11 | `url` | text | sim | — | — |
| 12 | `version` | integer | não | `1` | — |
| 13 | `previous_version` | jsonb | sim | — | — |
| 14 | `status` | text | não | `'draft'::text` | — |
| 15 | `sensitivity` | text | não | `'normal'::text` | — |
| 16 | `allowed_role_ids` | text[] | sim | — | — |
| 17 | `created_by` | text | não | — | — |
| 18 | `created_at` | timestamptz | não | `now()` | — |
| 19 | `updated_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- `asset_favorites.asset_id` → `asset_library_items.id`
- `asset_send_log.asset_id` → `asset_library_items.id`

## RLS — Row Level Security `[regra: mecânico]`

### `asset_library_items_delete` — DELETE · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `asset_library_items_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `asset_library_items_select` — SELECT · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `asset_library_items_update` — UPDATE · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`
- **WITH CHECK:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `asset_library_items_category_idx` — `CREATE INDEX asset_library_items_category_idx ON public.asset_library_items USING btree (category)`
- `asset_library_items_pkey` — `CREATE UNIQUE INDEX asset_library_items_pkey ON public.asset_library_items USING btree (id)`
- `asset_library_items_status_idx` — `CREATE INDEX asset_library_items_status_idx ON public.asset_library_items USING btree (status)`
- `asset_library_items_store_id_idx` — `CREATE INDEX asset_library_items_store_id_idx ON public.asset_library_items USING btree (store_id)`
- `asset_library_items_updated_at_idx` — `CREATE INDEX asset_library_items_updated_at_idx ON public.asset_library_items USING btree (updated_at DESC)`

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
