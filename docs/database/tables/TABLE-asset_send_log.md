---
objeto: asset_send_log
tipo: tabela
schema: public
status: existente
tier: estrutural
dominio: media
rls_enabled: true
colunas: 4
edge_functions: []
prds_relacionados: [PRD-027]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `asset_send_log`

> Log de envios de ativos da biblioteca. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** estrutural · **Domínio:** media · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `seller_id` | uuid | não | — | FK → `sellers.id` |
| 3 | `asset_id` | uuid | não | — | FK → `asset_library_items.id` ‹on delete cascade› |
| 4 | `sent_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `asset_id` → `asset_library_items.id` — on delete `CASCADE`
- `seller_id` → `sellers.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `asset_send_log_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((seller_id IN ( SELECT sellers.id FROM sellers WHERE (sellers.store_id = ( SELECT current_store_id() AS current_store_id)))) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `asset_send_log_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((seller_id IN ( SELECT sellers.id FROM sellers WHERE (sellers.store_id = ( SELECT current_store_id() AS current_store_id)))) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `asset_send_log_select` — SELECT · roles: `{authenticated}`
- **USING:** `((seller_id IN ( SELECT sellers.id FROM sellers WHERE (sellers.store_id = ( SELECT current_store_id() AS current_store_id)))) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `asset_send_log_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((seller_id IN ( SELECT sellers.id FROM sellers WHERE (sellers.store_id = ( SELECT current_store_id() AS current_store_id)))) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`
- **WITH CHECK:** `((seller_id IN ( SELECT sellers.id FROM sellers WHERE (sellers.store_id = ( SELECT current_store_id() AS current_store_id)))) AND (( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `asset_send_log_asset_id_idx` — `CREATE INDEX asset_send_log_asset_id_idx ON public.asset_send_log USING btree (asset_id)`
- `asset_send_log_pkey` — `CREATE UNIQUE INDEX asset_send_log_pkey ON public.asset_send_log USING btree (id)`
- `asset_send_log_seller_id_idx` — `CREATE INDEX asset_send_log_seller_id_idx ON public.asset_send_log USING btree (seller_id, sent_at DESC)`

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
