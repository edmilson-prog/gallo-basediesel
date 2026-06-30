---
objeto: sdr_escalations
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: sdr
rls_enabled: true
colunas: 19
edge_functions: []
prds_relacionados: [PRD-029]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `sdr_escalations`

> Escalonamentos do agente SDR para humano. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** sdr · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `session_id` | text | não | — | — |
| 3 | `conversation_id` | uuid | não | — | FK → `conversations.id` |
| 4 | `customer_id` | uuid | sim | — | FK → `customers.id` |
| 5 | `lead_id` | uuid | sim | — | FK → `leads.id` |
| 6 | `store_id` | uuid | não | — | FK → `stores.id` |
| 7 | `reason` | text | não | — | — |
| 8 | `reason_details` | text | sim | — | — |
| 9 | `mode` | text | não | — | — |
| 10 | `context_summary` | jsonb | não | — | — |
| 11 | `assigned_seller_id` | uuid | sim | — | FK → `sellers.id` |
| 12 | `assigned_at` | timestamptz | sim | — | — |
| 13 | `first_human_response_at` | timestamptz | sim | — | — |
| 14 | `status` | text | não | — | — |
| 15 | `specialty_matched` | boolean | sim | — | — |
| 16 | `urgent_broadcast_at` | timestamptz | sim | — | — |
| 17 | `urgent_broadcast_claimed_by_seller_id` | uuid | sim | — | FK → `sellers.id` |
| 18 | `urgent_broadcast_claimed_at` | timestamptz | sim | — | — |
| 19 | `created_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `assigned_seller_id` → `sellers.id`
- `conversation_id` → `conversations.id`
- `customer_id` → `customers.id`
- `lead_id` → `leads.id`
- `store_id` → `stores.id`
- `urgent_broadcast_claimed_by_seller_id` → `sellers.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `sdr_escalations_delete` — DELETE · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `sdr_escalations_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `sdr_escalations_select` — SELECT · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `sdr_escalations_update` — UPDATE · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`
- **WITH CHECK:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `idx_sdr_escalations_lead_id` — `CREATE INDEX idx_sdr_escalations_lead_id ON public.sdr_escalations USING btree (lead_id)`
- `idx_sdr_escalations_urgent_broadcast_claimed_by_seller_id` — `CREATE INDEX idx_sdr_escalations_urgent_broadcast_claimed_by_seller_id ON public.sdr_escalations USING btree (urgent_broadcast_claimed_by_seller_id)`
- `sdr_escalations_assigned_seller_id_idx` — `CREATE INDEX sdr_escalations_assigned_seller_id_idx ON public.sdr_escalations USING btree (assigned_seller_id)`
- `sdr_escalations_conversation_id_idx` — `CREATE INDEX sdr_escalations_conversation_id_idx ON public.sdr_escalations USING btree (conversation_id)`
- `sdr_escalations_created_at_idx` — `CREATE INDEX sdr_escalations_created_at_idx ON public.sdr_escalations USING btree (created_at DESC)`
- `sdr_escalations_customer_id_idx` — `CREATE INDEX sdr_escalations_customer_id_idx ON public.sdr_escalations USING btree (customer_id)`
- `sdr_escalations_pkey` — `CREATE UNIQUE INDEX sdr_escalations_pkey ON public.sdr_escalations USING btree (id)`
- `sdr_escalations_session_id_idx` — `CREATE INDEX sdr_escalations_session_id_idx ON public.sdr_escalations USING btree (session_id)`
- `sdr_escalations_status_idx` — `CREATE INDEX sdr_escalations_status_idx ON public.sdr_escalations USING btree (status)`
- `sdr_escalations_store_id_idx` — `CREATE INDEX sdr_escalations_store_id_idx ON public.sdr_escalations USING btree (store_id)`

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
