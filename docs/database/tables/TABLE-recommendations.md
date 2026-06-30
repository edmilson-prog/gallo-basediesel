---
objeto: recommendations
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: catalog
rls_enabled: true
colunas: 12
edge_functions: []
prds_relacionados: [PRD-023]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `recommendations`

> Recomendações de produto/ação. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** catalog · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | não | — | FK → `stores.id` |
| 3 | `seller_id` | uuid | não | — | FK → `sellers.id` |
| 4 | `subject_id` | uuid | não | — | FK → `customers.id` |
| 5 | `type` | text | não | — | — |
| 6 | `priority` | text | não | — | — |
| 7 | `title` | text | não | — | — |
| 8 | `description` | text | não | — | — |
| 9 | `action_href` | text | sim | — | — |
| 10 | `resolved` | boolean | não | `false` | — |
| 11 | `created_at` | timestamptz | não | `now()` | — |
| 12 | `resolved_at` | timestamptz | sim | — | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `seller_id` → `sellers.id`
- `store_id` → `stores.id`
- `subject_id` → `customers.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `recommendations_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `recommendations_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `recommendations_select` — SELECT · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `recommendations_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `recommendations_pkey` — `CREATE UNIQUE INDEX recommendations_pkey ON public.recommendations USING btree (id)`
- `recommendations_resolved_idx` — `CREATE INDEX recommendations_resolved_idx ON public.recommendations USING btree (resolved)`
- `recommendations_seller_id_idx` — `CREATE INDEX recommendations_seller_id_idx ON public.recommendations USING btree (seller_id)`
- `recommendations_store_id_idx` — `CREATE INDEX recommendations_store_id_idx ON public.recommendations USING btree (store_id)`
- `recommendations_subject_id_idx` — `CREATE INDEX recommendations_subject_id_idx ON public.recommendations USING btree (subject_id)`
- `recommendations_type_idx` — `CREATE INDEX recommendations_type_idx ON public.recommendations USING btree (type)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

`❓ pendente` — regras de negócio narrativas (o "porquê") a inferir na Fase 3 / confirmar com o humano.

## Perguntas pendentes

- ❓ A tabela `recommendations` ainda é usada na prática? (classificada por nome/FK; confirmar uso real e volume de escrita recente.)

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
