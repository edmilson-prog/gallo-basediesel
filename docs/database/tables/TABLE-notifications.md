---
objeto: notifications
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: notifications
rls_enabled: true
colunas: 22
edge_functions: []
prds_relacionados: [PRD-024]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `notifications`

> Central de notificações in-app (parte derivada via pg_cron). `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** notifications · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `dedupe_key` | text | não | — | — |
| 3 | `lifecycle` | text | não | — | — |
| 4 | `type` | text | não | — | — |
| 5 | `category` | text | não | — | — |
| 6 | `severity` | text | não | — | — |
| 7 | `recipient_id` | text | não | — | — |
| 8 | `recipient_type` | text | não | — | — |
| 9 | `store_id` | uuid | sim | — | FK → `stores.id` ‹on delete cascade› |
| 10 | `title` | text | não | — | — |
| 11 | `body` | text | sim | — | — |
| 12 | `entity_ref` | jsonb | sim | — | — |
| 13 | `actions` | jsonb | sim | — | — |
| 14 | `status` | text | não | `'unread'::text` | — |
| 15 | `channels` | text[] | não | `'{}'::text[]` | — |
| 16 | `delivery_status` | jsonb | sim | — | — |
| 17 | `group_key` | text | sim | — | — |
| 18 | `source` | text | não | — | — |
| 19 | `created_at` | timestamptz | não | `now()` | — |
| 20 | `read_at` | timestamptz | sim | — | — |
| 21 | `expires_at` | timestamptz | sim | — | — |
| 22 | `metadata` | jsonb | sim | — | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `store_id` → `stores.id` — on delete `CASCADE`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `notifications_delete` — DELETE · roles: `{authenticated}`
- **USING:** `(((store_id = ( SELECT current_store_id() AS current_store_id)) OR (store_id IS NULL)) AND (( SELECT is_staff() AS is_staff) OR (recipient_id = (( SELECT current_seller_id() AS current_seller_id))::text)))`

### `notifications_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `(((store_id = ( SELECT current_store_id() AS current_store_id)) OR (store_id IS NULL)) AND (( SELECT is_staff() AS is_staff) OR (recipient_id = (( SELECT current_seller_id() AS current_seller_id))::text)))`

### `notifications_select` — SELECT · roles: `{authenticated}`
- **USING:** `(((store_id = ( SELECT current_store_id() AS current_store_id)) OR (store_id IS NULL)) AND (( SELECT is_staff() AS is_staff) OR (recipient_id = (( SELECT current_seller_id() AS current_seller_id))::text)))`

### `notifications_update` — UPDATE · roles: `{authenticated}`
- **USING:** `(((store_id = ( SELECT current_store_id() AS current_store_id)) OR (store_id IS NULL)) AND (( SELECT is_staff() AS is_staff) OR (recipient_id = (( SELECT current_seller_id() AS current_seller_id))::text)))`
- **WITH CHECK:** `(((store_id = ( SELECT current_store_id() AS current_store_id)) OR (store_id IS NULL)) AND (( SELECT is_staff() AS is_staff) OR (recipient_id = (( SELECT current_seller_id() AS current_seller_id))::text)))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `notifications_lifecycle_dedupe_idx` — `CREATE INDEX notifications_lifecycle_dedupe_idx ON public.notifications USING btree (lifecycle, dedupe_key)`
- `notifications_pkey` — `CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id)`
- `notifications_recipient_id_idx` — `CREATE INDEX notifications_recipient_id_idx ON public.notifications USING btree (recipient_id)`
- `notifications_recipient_status_idx` — `CREATE INDEX notifications_recipient_status_idx ON public.notifications USING btree (recipient_id, status)`
- `notifications_status_idx` — `CREATE INDEX notifications_status_idx ON public.notifications USING btree (status)`
- `notifications_store_id_idx` — `CREATE INDEX notifications_store_id_idx ON public.notifications USING btree (store_id)`

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
