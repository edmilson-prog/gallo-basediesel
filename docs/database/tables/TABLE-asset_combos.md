---
objeto: asset_combos
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: media
rls_enabled: true
colunas: 7
edge_functions: []
prds_relacionados: [PRD-027]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `asset_combos`

> Combos de ativos para envio rápido. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** media · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | não | — | FK → `stores.id` |
| 3 | `title` | text | não | — | — |
| 4 | `asset_ids` | text[] | não | `'{}'::text[]` | — |
| 5 | `owner_id` | uuid | não | — | FK → `sellers.id` |
| 6 | `created_at` | timestamptz | não | `now()` | — |
| 7 | `updated_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `owner_id` → `sellers.id`
- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `asset_combos_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (owner_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `asset_combos_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (owner_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `asset_combos_select` — SELECT · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (owner_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `asset_combos_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (owner_id = ( SELECT current_seller_id() AS current_seller_id))))`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (owner_id = ( SELECT current_seller_id() AS current_seller_id))))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `asset_combos_pkey` — `CREATE UNIQUE INDEX asset_combos_pkey ON public.asset_combos USING btree (id)`
- `asset_combos_store_id_idx` — `CREATE INDEX asset_combos_store_id_idx ON public.asset_combos USING btree (store_id)`
- `idx_asset_combos_owner_id` — `CREATE INDEX idx_asset_combos_owner_id ON public.asset_combos USING btree (owner_id)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

`❓ pendente` — regras de negócio narrativas (o "porquê") a inferir na Fase 3 / confirmar com o humano.

## Perguntas pendentes

- ❓ A tabela `asset_combos` ainda é usada na prática? (classificada por nome/FK; confirmar uso real e volume de escrita recente.)

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
