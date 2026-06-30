---
objeto: model_kits
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: catalog
rls_enabled: true
colunas: 10
edge_functions: []
prds_relacionados: [PRD-025]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `model_kits`

> Kits de peças por modelo de veículo. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** catalog · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `model_id` | uuid | não | — | FK → `vehicle_models.id` ‹on delete cascade› |
| 3 | `store_id` | uuid | não | — | FK → `stores.id` ‹on delete cascade› |
| 4 | `name` | text | não | — | — |
| 5 | `category` | text | não | — | — |
| 6 | `status` | text | não | `'rascunho'::text` | — |
| 7 | `created_by` | text | não | — | — |
| 8 | `created_at` | timestamptz | não | `now()` | — |
| 9 | `updated_at` | timestamptz | não | `now()` | — |
| 10 | `updated_by` | text | sim | — | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `model_id` → `vehicle_models.id` — on delete `CASCADE`
- `store_id` → `stores.id` — on delete `CASCADE`

**Entrando (referenciam esta tabela):**

- `model_kit_items.kit_id` → `model_kits.id`

## RLS — Row Level Security `[regra: mecânico]`

### `model_kits_delete` — DELETE · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `model_kits_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `model_kits_select` — SELECT · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `model_kits_update` — UPDATE · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`
- **WITH CHECK:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `model_kits_model_id_idx` — `CREATE INDEX model_kits_model_id_idx ON public.model_kits USING btree (model_id)`
- `model_kits_pkey` — `CREATE UNIQUE INDEX model_kits_pkey ON public.model_kits USING btree (id)`
- `model_kits_status_idx` — `CREATE INDEX model_kits_status_idx ON public.model_kits USING btree (status)`
- `model_kits_store_id_idx` — `CREATE INDEX model_kits_store_id_idx ON public.model_kits USING btree (store_id)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

`❓ pendente` — regras de negócio narrativas (o "porquê") a inferir na Fase 3 / confirmar com o humano.

## Perguntas pendentes

- ❓ A tabela `model_kits` ainda é usada na prática? (classificada por nome/FK; confirmar uso real e volume de escrita recente.)

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
