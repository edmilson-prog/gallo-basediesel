---
objeto: vehicle_models
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: vehicles
rls_enabled: true
colunas: 11
edge_functions: []
prds_relacionados: [PRD-025]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `vehicle_models`

> Modelos de veículo (catálogo compartilhado). `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** vehicles · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `brand` | text | não | — | — |
| 3 | `model` | text | não | — | — |
| 4 | `engine` | text | não | — | — |
| 5 | `year_start` | integer | sim | — | — |
| 6 | `year_end` | integer | sim | — | — |
| 7 | `status` | text | não | `'ativo'::text` | — |
| 8 | `created_by` | text | não | — | — |
| 9 | `created_at` | timestamptz | não | `now()` | — |
| 10 | `updated_at` | timestamptz | não | `now()` | — |
| 11 | `updated_by` | text | sim | — | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- _nenhuma_

**Entrando (referenciam esta tabela):**

- `model_kits.model_id` → `vehicle_models.id`

## RLS — Row Level Security `[regra: mecânico]`

### `vehicle_models_delete` — DELETE · roles: `{authenticated}`
- **USING:** `( SELECT is_staff() AS is_staff)`

### `vehicle_models_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `( SELECT is_staff() AS is_staff)`

### `vehicle_models_select` — SELECT · roles: `{authenticated}`
- **USING:** `true`

### `vehicle_models_update` — UPDATE · roles: `{authenticated}`
- **USING:** `( SELECT is_staff() AS is_staff)`
- **WITH CHECK:** `( SELECT is_staff() AS is_staff)`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `vehicle_models_brand_idx` — `CREATE INDEX vehicle_models_brand_idx ON public.vehicle_models USING btree (brand)`
- `vehicle_models_brand_model_engine_key` — `CREATE UNIQUE INDEX vehicle_models_brand_model_engine_key ON public.vehicle_models USING btree (lower(brand), lower(model), lower(engine))`
- `vehicle_models_pkey` — `CREATE UNIQUE INDEX vehicle_models_pkey ON public.vehicle_models USING btree (id)`
- `vehicle_models_status_idx` — `CREATE INDEX vehicle_models_status_idx ON public.vehicle_models USING btree (status)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

**CHECK constraints (regras explícitas no banco) `[mecânico]`:**

- `vehicle_models_status_check`: `(status = ANY (ARRAY['ativo'::text, 'inativo'::text]))`

`❓ pendente` — regras de negócio narrativas (o "porquê") a inferir na Fase 3 / confirmar com o humano.

## Perguntas pendentes

- _(nenhuma registrada ainda)_

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
