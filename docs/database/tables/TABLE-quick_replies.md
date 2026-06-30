---
objeto: quick_replies
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: media
rls_enabled: true
colunas: 10
edge_functions: []
prds_relacionados: [PRD-027]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `quick_replies`

> Respostas rápidas de texto. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** media · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | não | — | FK → `stores.id` |
| 3 | `shortcut` | text | não | — | — |
| 4 | `title` | text | não | — | — |
| 5 | `body` | text | não | — | — |
| 6 | `scope` | text | não | — | — |
| 7 | `owner_id` | uuid | não | — | FK → `sellers.id` |
| 8 | `allowed_role_ids` | text[] | sim | — | — |
| 9 | `created_at` | timestamptz | não | `now()` | — |
| 10 | `updated_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `owner_id` → `sellers.id`
- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `quick_replies_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (owner_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `quick_replies_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (owner_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `quick_replies_select` — SELECT · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (scope = 'shared'::text) OR (owner_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `quick_replies_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (owner_id = ( SELECT current_seller_id() AS current_seller_id))))`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (owner_id = ( SELECT current_seller_id() AS current_seller_id))))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `quick_replies_owner_id_idx` — `CREATE INDEX quick_replies_owner_id_idx ON public.quick_replies USING btree (owner_id)`
- `quick_replies_pkey` — `CREATE UNIQUE INDEX quick_replies_pkey ON public.quick_replies USING btree (id)`
- `quick_replies_shortcut_idx` — `CREATE INDEX quick_replies_shortcut_idx ON public.quick_replies USING btree (shortcut)`
- `quick_replies_store_id_idx` — `CREATE INDEX quick_replies_store_id_idx ON public.quick_replies USING btree (store_id)`

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
