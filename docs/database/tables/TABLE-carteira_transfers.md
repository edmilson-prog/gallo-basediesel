---
objeto: carteira_transfers
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: leads
rls_enabled: true
colunas: 13
edge_functions: []
prds_relacionados: [PRD-011]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `carteira_transfers`

> Transferências de carteira (cliente/lead) entre vendedores. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** leads · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | não | — | FK → `stores.id` |
| 3 | `type` | text | não | — | — |
| 4 | `from_seller_id` | uuid | não | — | FK → `sellers.id` |
| 5 | `to_seller_id` | uuid | não | — | FK → `sellers.id` |
| 6 | `customer_ids` | text[] | não | `'{}'::text[]` | — |
| 7 | `reason` | text | não | — | — |
| 8 | `start_date` | timestamptz | não | — | — |
| 9 | `end_date` | timestamptz | sim | — | — |
| 10 | `auto_revert_at` | timestamptz | sim | — | — |
| 11 | `status` | text | não | `'active'::text` | — |
| 12 | `created_by` | uuid | não | — | FK → `sellers.id` |
| 13 | `created_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `created_by` → `sellers.id`
- `from_seller_id` → `sellers.id`
- `store_id` → `stores.id`
- `to_seller_id` → `sellers.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `carteira_transfers_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

### `carteira_transfers_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

### `carteira_transfers_select` — SELECT · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

### `carteira_transfers_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `carteira_transfers_from_seller_id_idx` — `CREATE INDEX carteira_transfers_from_seller_id_idx ON public.carteira_transfers USING btree (from_seller_id)`
- `carteira_transfers_pkey` — `CREATE UNIQUE INDEX carteira_transfers_pkey ON public.carteira_transfers USING btree (id)`
- `carteira_transfers_start_date_idx` — `CREATE INDEX carteira_transfers_start_date_idx ON public.carteira_transfers USING btree (start_date DESC)`
- `carteira_transfers_status_idx` — `CREATE INDEX carteira_transfers_status_idx ON public.carteira_transfers USING btree (status)`
- `carteira_transfers_store_id_idx` — `CREATE INDEX carteira_transfers_store_id_idx ON public.carteira_transfers USING btree (store_id)`
- `carteira_transfers_to_seller_id_idx` — `CREATE INDEX carteira_transfers_to_seller_id_idx ON public.carteira_transfers USING btree (to_seller_id)`
- `carteira_transfers_type_idx` — `CREATE INDEX carteira_transfers_type_idx ON public.carteira_transfers USING btree (type)`
- `idx_carteira_transfers_created_by` — `CREATE INDEX idx_carteira_transfers_created_by ON public.carteira_transfers USING btree (created_by)`

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
