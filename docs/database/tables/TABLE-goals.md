---
objeto: goals
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: finance
rls_enabled: true
colunas: 18
edge_functions: []
prds_relacionados: [PRD-017]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `goals`

> Metas de vendas por vendedor/loja. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** finance · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | não | — | FK → `stores.id` |
| 3 | `level` | text | não | — | — |
| 4 | `target_id` | text | não | — | — |
| 5 | `seller_id` | uuid | sim | — | FK → `sellers.id` |
| 6 | `period` | jsonb | não | — | — |
| 7 | `metric` | text | não | — | — |
| 8 | `target_value` | numeric | não | `0` | — |
| 9 | `current_value` | numeric | não | `0` | — |
| 10 | `progress_percent` | numeric | não | `0` | — |
| 11 | `division` | text | sim | — | — |
| 12 | `name` | text | sim | — | — |
| 13 | `status` | text | sim | — | — |
| 14 | `reward_description` | text | sim | — | — |
| 15 | `created_by` | uuid | sim | — | FK → `sellers.id` |
| 16 | `cancel_reason` | text | sim | — | — |
| 17 | `created_at` | timestamptz | não | `now()` | — |
| 18 | `updated_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `created_by` → `sellers.id`
- `seller_id` → `sellers.id`
- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `goals_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `goals_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `goals_select` — SELECT · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `goals_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `goals_level_idx` — `CREATE INDEX goals_level_idx ON public.goals USING btree (level)`
- `goals_metric_idx` — `CREATE INDEX goals_metric_idx ON public.goals USING btree (metric)`
- `goals_pkey` — `CREATE UNIQUE INDEX goals_pkey ON public.goals USING btree (id)`
- `goals_seller_id_idx` — `CREATE INDEX goals_seller_id_idx ON public.goals USING btree (seller_id)`
- `goals_store_id_idx` — `CREATE INDEX goals_store_id_idx ON public.goals USING btree (store_id)`
- `goals_target_id_idx` — `CREATE INDEX goals_target_id_idx ON public.goals USING btree (target_id)`
- `idx_goals_created_by` — `CREATE INDEX idx_goals_created_by ON public.goals USING btree (created_by)`

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
