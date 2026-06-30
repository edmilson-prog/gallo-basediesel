---
objeto: distribution_traces
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: leads
rls_enabled: true
colunas: 10
edge_functions: []
prds_relacionados: [PRD-013/213]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `distribution_traces`

> Rastro da decisão de distribuição/rodízio de uma conversa. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** leads · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `conversation_id` | uuid | não | — | FK → `conversations.id` |
| 3 | `customer_id` | uuid | sim | — | FK → `customers.id` |
| 4 | `lead_id` | uuid | sim | — | FK → `leads.id` |
| 5 | `store_id` | uuid | não | — | FK → `stores.id` |
| 6 | `timestamp` | timestamptz | não | — | — |
| 7 | `selected_seller_id` | uuid | sim | — | FK → `sellers.id` |
| 8 | `criterion_matched` | text | não | — | — |
| 9 | `candidates_evaluated` | jsonb | não | `'[]'::jsonb` | — |
| 10 | `mode` | text | não | — | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `conversation_id` → `conversations.id`
- `customer_id` → `customers.id`
- `lead_id` → `leads.id`
- `selected_seller_id` → `sellers.id`
- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `distribution_traces_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

### `distribution_traces_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

### `distribution_traces_select` — SELECT · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

### `distribution_traces_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `distribution_traces_conversation_id_idx` — `CREATE INDEX distribution_traces_conversation_id_idx ON public.distribution_traces USING btree (conversation_id)`
- `distribution_traces_pkey` — `CREATE UNIQUE INDEX distribution_traces_pkey ON public.distribution_traces USING btree (id)`
- `distribution_traces_selected_seller_id_idx` — `CREATE INDEX distribution_traces_selected_seller_id_idx ON public.distribution_traces USING btree (selected_seller_id)`
- `distribution_traces_store_id_idx` — `CREATE INDEX distribution_traces_store_id_idx ON public.distribution_traces USING btree (store_id)`
- `distribution_traces_timestamp_idx` — `CREATE INDEX distribution_traces_timestamp_idx ON public.distribution_traces USING btree ("timestamp" DESC)`
- `idx_distribution_traces_customer_id` — `CREATE INDEX idx_distribution_traces_customer_id ON public.distribution_traces USING btree (customer_id)`
- `idx_distribution_traces_lead_id` — `CREATE INDEX idx_distribution_traces_lead_id ON public.distribution_traces USING btree (lead_id)`

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
