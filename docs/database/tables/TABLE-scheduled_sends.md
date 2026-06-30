---
objeto: scheduled_sends
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: media
rls_enabled: true
colunas: 10
edge_functions: []
prds_relacionados: [Chronicle]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `scheduled_sends`

> Envios agendados de mensagem/mídia. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** media · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | não | — | FK → `stores.id` |
| 3 | `conversation_id` | uuid | não | — | FK → `conversations.id` |
| 4 | `scheduled_for` | timestamptz | sim | — | — |
| 5 | `payload` | jsonb | não | — | — |
| 6 | `status` | text | não | `'pending'::text` | — |
| 7 | `failure_reason` | text | sim | — | — |
| 8 | `created_by` | text | não | — | — |
| 9 | `created_at` | timestamptz | não | `now()` | — |
| 10 | `dispatch_started_at` | timestamptz | sim | — | When the server worker last claimed this row for dispatch. NULL = unclaimed. Dedups concurrent ticks; a row stuck >5min (crash) is re-claimable. |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `conversation_id` → `conversations.id`
- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `scheduled_sends_delete` — DELETE · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `scheduled_sends_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `scheduled_sends_select` — SELECT · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `scheduled_sends_update` — UPDATE · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`
- **WITH CHECK:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `scheduled_sends_conversation_id_idx` — `CREATE INDEX scheduled_sends_conversation_id_idx ON public.scheduled_sends USING btree (conversation_id)`
- `scheduled_sends_pkey` — `CREATE UNIQUE INDEX scheduled_sends_pkey ON public.scheduled_sends USING btree (id)`
- `scheduled_sends_status_scheduled_for_idx` — `CREATE INDEX scheduled_sends_status_scheduled_for_idx ON public.scheduled_sends USING btree (status, scheduled_for)`
- `scheduled_sends_store_id_idx` — `CREATE INDEX scheduled_sends_store_id_idx ON public.scheduled_sends USING btree (store_id)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

**CHECK constraints (regras explícitas no banco) `[mecânico]`:**

- `scheduled_sends_pending_needs_time`: `((status <> 'pending'::text) OR (scheduled_for IS NOT NULL))`
- `scheduled_sends_status_check`: `(status = ANY (ARRAY['draft'::text, 'pending'::text, 'sent'::text, 'cancelled'::text, 'failed'::text]))`

`❓ pendente` — regras de negócio narrativas (o "porquê") a inferir na Fase 3 / confirmar com o humano.

## Perguntas pendentes

- _(nenhuma registrada ainda)_

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
