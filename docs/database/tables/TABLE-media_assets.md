---
objeto: media_assets
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: media
rls_enabled: true
colunas: 25
edge_functions: []
prds_relacionados: [PRD-026]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `media_assets`

> Ativos de mídia (gestão central — Vault). `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** media · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | não | — | FK → `stores.id` ‹on delete cascade› |
| 3 | `conversation_id` | uuid | sim | — | FK → `conversations.id` ‹on delete set null› |
| 4 | `customer_id` | uuid | sim | — | FK → `customers.id` ‹on delete set null› |
| 5 | `message_id` | uuid | sim | — | FK → `messages.id` ‹on delete set null› |
| 6 | `kind` | text | não | — | — |
| 7 | `mime_type` | text | não | — | — |
| 8 | `size_bytes` | integer | não | — | — |
| 9 | `file_name` | text | sim | — | — |
| 10 | `author_type` | text | não | — | — |
| 11 | `direction` | text | não | — | — |
| 12 | `created_at` | timestamptz | não | `now()` | — |
| 13 | `storage_ref` | text | não | — | — |
| 14 | `persisted` | boolean | não | `true` | — |
| 15 | `source_expires_at` | timestamptz | sim | — | — |
| 16 | `content_hash` | text | sim | — | — |
| 17 | `classification` | text | sim | — | — |
| 18 | `linked_vehicle_id` | uuid | sim | — | FK → `vehicles.id` ‹on delete set null› |
| 19 | `linked_order_id` | uuid | sim | — | FK → `orders.id` ‹on delete set null› |
| 20 | `linked_part_id` | uuid | sim | — | FK → `parts.id` ‹on delete set null› |
| 21 | `ocr_text` | text | sim | — | — |
| 22 | `transcription` | text | sim | — | — |
| 23 | `sensitivity` | text | não | `'normal'::text` | — |
| 24 | `annotations` | jsonb | sim | — | — |
| 25 | `version` | integer | sim | — | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `conversation_id` → `conversations.id` — on delete `SET NULL`
- `customer_id` → `customers.id` — on delete `SET NULL`
- `linked_order_id` → `orders.id` — on delete `SET NULL`
- `linked_part_id` → `parts.id` — on delete `SET NULL`
- `linked_vehicle_id` → `vehicles.id` — on delete `SET NULL`
- `message_id` → `messages.id` — on delete `SET NULL`
- `store_id` → `stores.id` — on delete `CASCADE`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `media_assets_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR ((customer_id IS NOT NULL) AND (customer_id IN ( SELECT customers.id FROM customers WHERE (customers.seller_id = ( SELECT current_seller_id() AS current_seller_id))))) OR ((conversation_id IS NOT NULL) AND (conversation_id IN ( SELECT conversations.id FROM conversations WHERE (conversations.assigned_seller_id = ( SELECT current_seller_id() AS current_seller_id)))))))`

### `media_assets_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR ((customer_id IS NOT NULL) AND (customer_id IN ( SELECT customers.id FROM customers WHERE (customers.seller_id = ( SELECT current_seller_id() AS current_seller_id))))) OR ((conversation_id IS NOT NULL) AND (conversation_id IN ( SELECT conversations.id FROM conversations WHERE ((conversations.store_id = ( SELECT current_store_id() AS current_store_id)) AND ((conversations.assigned_seller_id = ( SELECT current_seller_id() AS current_seller_id)) OR (conversations.assigned_seller_id IS NULL))))))))`

### `media_assets_select` — SELECT · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR ((customer_id IS NOT NULL) AND (customer_id IN ( SELECT customers.id FROM customers WHERE (customers.seller_id = ( SELECT current_seller_id() AS current_seller_id))))) OR ((conversation_id IS NOT NULL) AND (conversation_id IN ( SELECT conversations.id FROM conversations WHERE (conversations.assigned_seller_id = ( SELECT current_seller_id() AS current_seller_id)))))))`

### `media_assets_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR ((customer_id IS NOT NULL) AND (customer_id IN ( SELECT customers.id FROM customers WHERE (customers.seller_id = ( SELECT current_seller_id() AS current_seller_id))))) OR ((conversation_id IS NOT NULL) AND (conversation_id IN ( SELECT conversations.id FROM conversations WHERE (conversations.assigned_seller_id = ( SELECT current_seller_id() AS current_seller_id)))))))`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR ((customer_id IS NOT NULL) AND (customer_id IN ( SELECT customers.id FROM customers WHERE (customers.seller_id = ( SELECT current_seller_id() AS current_seller_id))))) OR ((conversation_id IS NOT NULL) AND (conversation_id IN ( SELECT conversations.id FROM conversations WHERE (conversations.assigned_seller_id = ( SELECT current_seller_id() AS current_seller_id)))))))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `idx_media_assets_linked_order_id` — `CREATE INDEX idx_media_assets_linked_order_id ON public.media_assets USING btree (linked_order_id)`
- `idx_media_assets_linked_part_id` — `CREATE INDEX idx_media_assets_linked_part_id ON public.media_assets USING btree (linked_part_id)`
- `idx_media_assets_linked_vehicle_id` — `CREATE INDEX idx_media_assets_linked_vehicle_id ON public.media_assets USING btree (linked_vehicle_id)`
- `media_assets_content_hash_idx` — `CREATE INDEX media_assets_content_hash_idx ON public.media_assets USING btree (content_hash)`
- `media_assets_conversation_id_idx` — `CREATE INDEX media_assets_conversation_id_idx ON public.media_assets USING btree (conversation_id)`
- `media_assets_created_at_idx` — `CREATE INDEX media_assets_created_at_idx ON public.media_assets USING btree (created_at DESC)`
- `media_assets_customer_id_idx` — `CREATE INDEX media_assets_customer_id_idx ON public.media_assets USING btree (customer_id)`
- `media_assets_message_id_idx` — `CREATE INDEX media_assets_message_id_idx ON public.media_assets USING btree (message_id)`
- `media_assets_pkey` — `CREATE UNIQUE INDEX media_assets_pkey ON public.media_assets USING btree (id)`
- `media_assets_store_id_idx` — `CREATE INDEX media_assets_store_id_idx ON public.media_assets USING btree (store_id)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

**CHECK constraints (regras explícitas no banco) `[mecânico]`:**

- `media_assets_author_type_check`: `(author_type = ANY (ARRAY['customer'::text, 'seller'::text, 'sdr'::text, 'system'::text]))`
- `media_assets_classification_check`: `(classification = ANY (ARRAY['nota_fiscal'::text, 'peca'::text, 'chassi_placa'::text, 'comprovante'::text, 'catalogo'::text, 'outro'::text]))`
- `media_assets_direction_check`: `(direction = ANY (ARRAY['in'::text, 'out'::text]))`
- `media_assets_kind_check`: `(kind = ANY (ARRAY['image'::text, 'audio'::text, 'document'::text, 'video'::text]))`
- `media_assets_sensitivity_check`: `(sensitivity = ANY (ARRAY['normal'::text, 'sensitive'::text]))`

`❓ pendente` — regras de negócio narrativas (o "porquê") a inferir na Fase 3 / confirmar com o humano.

## Perguntas pendentes

- _(nenhuma registrada ainda)_

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
