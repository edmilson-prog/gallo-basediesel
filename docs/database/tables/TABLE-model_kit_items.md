---
objeto: model_kit_items
tipo: tabela
schema: public
status: existente
tier: estrutural
dominio: catalog
rls_enabled: true
colunas: 6
edge_functions: []
prds_relacionados: [PRD-025]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `model_kit_items`

> Junção kit↔peça. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** estrutural · **Domínio:** catalog · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `kit_id` | uuid | não | — | FK → `model_kits.id` ‹on delete cascade› |
| 3 | `part_id` | uuid | não | — | FK → `parts.id` ‹on delete restrict› |
| 4 | `default_quantity` | integer | não | `1` | — |
| 5 | `is_optional` | boolean | não | `false` | — |
| 6 | `note` | text | sim | — | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `kit_id` → `model_kits.id` — on delete `CASCADE`
- `part_id` → `parts.id` — on delete `RESTRICT`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `model_kit_items_delete` — DELETE · roles: `{authenticated}`
- **USING:** `(kit_id IN ( SELECT model_kits.id FROM model_kits WHERE (model_kits.store_id = ( SELECT current_store_id() AS current_store_id))))`

### `model_kit_items_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `(kit_id IN ( SELECT model_kits.id FROM model_kits WHERE (model_kits.store_id = ( SELECT current_store_id() AS current_store_id))))`

### `model_kit_items_select` — SELECT · roles: `{authenticated}`
- **USING:** `(kit_id IN ( SELECT model_kits.id FROM model_kits WHERE (model_kits.store_id = ( SELECT current_store_id() AS current_store_id))))`

### `model_kit_items_update` — UPDATE · roles: `{authenticated}`
- **USING:** `(kit_id IN ( SELECT model_kits.id FROM model_kits WHERE (model_kits.store_id = ( SELECT current_store_id() AS current_store_id))))`
- **WITH CHECK:** `(kit_id IN ( SELECT model_kits.id FROM model_kits WHERE (model_kits.store_id = ( SELECT current_store_id() AS current_store_id))))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `model_kit_items_kit_id_idx` — `CREATE INDEX model_kit_items_kit_id_idx ON public.model_kit_items USING btree (kit_id)`
- `model_kit_items_part_id_idx` — `CREATE INDEX model_kit_items_part_id_idx ON public.model_kit_items USING btree (part_id)`
- `model_kit_items_pkey` — `CREATE UNIQUE INDEX model_kit_items_pkey ON public.model_kit_items USING btree (id)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

`❓ pendente` — regras de negócio narrativas (o "porquê") a inferir na Fase 3 / confirmar com o humano.

## Perguntas pendentes

- ❓ A tabela `model_kit_items` ainda é usada na prática? (classificada por nome/FK; confirmar uso real e volume de escrita recente.)

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
