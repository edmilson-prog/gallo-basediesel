---
objeto: trackable_links
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: media
rls_enabled: true
colunas: 12
edge_functions: []
prds_relacionados: [PRD-027]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `trackable_links`

> Links rastreáveis enviados ao cliente. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** media · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | não | — | FK → `stores.id` |
| 3 | `asset_id` | text | sim | — | — |
| 4 | `conversation_id` | uuid | sim | — | FK → `conversations.id` |
| 5 | `lead_id` | uuid | sim | — | FK → `leads.id` |
| 6 | `target_url` | text | não | — | — |
| 7 | `short_ref` | text | não | — | — |
| 8 | `utm` | jsonb | sim | — | — |
| 9 | `created_by` | text | não | — | — |
| 10 | `opens` | integer | não | `0` | — |
| 11 | `last_opened_at` | timestamptz | sim | — | — |
| 12 | `created_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `conversation_id` → `conversations.id`
- `lead_id` → `leads.id`
- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `trackable_links_delete` — DELETE · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `trackable_links_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `trackable_links_select` — SELECT · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `trackable_links_update` — UPDATE · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`
- **WITH CHECK:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `trackable_links_conversation_id_idx` — `CREATE INDEX trackable_links_conversation_id_idx ON public.trackable_links USING btree (conversation_id)`
- `trackable_links_lead_id_idx` — `CREATE INDEX trackable_links_lead_id_idx ON public.trackable_links USING btree (lead_id)`
- `trackable_links_pkey` — `CREATE UNIQUE INDEX trackable_links_pkey ON public.trackable_links USING btree (id)`
- `trackable_links_store_id_idx` — `CREATE INDEX trackable_links_store_id_idx ON public.trackable_links USING btree (store_id)`

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
