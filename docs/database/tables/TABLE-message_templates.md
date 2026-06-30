---
objeto: message_templates
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: conversations
rls_enabled: true
colunas: 20
edge_functions: []
prds_relacionados: [PRD-116]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `message_templates`

> Catálogo de templates HSM do WhatsApp. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** conversations · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: COMMENT ON message_templates, no próprio banco)`

> HSM template catalog (PRD-116). Mirrors Meta Business Manager approvals; manual sync in MVP.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | sim | — | FK → `stores.id` |
| 3 | `whatsapp_account_id` | uuid | sim | — | FK → `whatsapp_accounts.id` |
| 4 | `meta_template_name` | text | não | — | — |
| 5 | `meta_language_code` | text | não | `'pt_BR'::text` | — |
| 6 | `meta_category` | text | não | — | — |
| 7 | `meta_status` | text | não | `'unknown'::text` | — |
| 8 | `display_name` | text | não | — | — |
| 9 | `description` | text | sim | — | — |
| 10 | `is_active` | boolean | não | `true` | — |
| 11 | `body_template` | text | não | — | — |
| 12 | `variable_count` | integer | não | `0` | — |
| 13 | `variable_labels` | jsonb | não | `'[]'::jsonb` | — |
| 14 | `header_type` | text | sim | — | — |
| 15 | `header_text_template` | text | sim | — | — |
| 16 | `buttons` | jsonb | sim | — | — |
| 17 | `created_by` | uuid | sim | — | FK → `sellers.id` |
| 18 | `created_at` | timestamptz | não | `now()` | — |
| 19 | `updated_at` | timestamptz | não | `now()` | — |
| 20 | `last_synced_at` | timestamptz | sim | — | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `created_by` → `sellers.id`
- `store_id` → `stores.id`
- `whatsapp_account_id` → `whatsapp_accounts.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `message_templates_delete` — DELETE · roles: `{authenticated}`
- **USING:** `(( SELECT is_staff() AS is_staff) AND ((store_id IS NULL) OR (store_id = ( SELECT current_store_id() AS current_store_id))))`

### `message_templates_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `(( SELECT is_staff() AS is_staff) AND ((store_id IS NULL) OR (store_id = ( SELECT current_store_id() AS current_store_id))))`

### `message_templates_select` — SELECT · roles: `{authenticated}`
- **USING:** `((store_id IS NULL) OR (store_id = ( SELECT current_store_id() AS current_store_id)))`

### `message_templates_update` — UPDATE · roles: `{authenticated}`
- **USING:** `(( SELECT is_staff() AS is_staff) AND ((store_id IS NULL) OR (store_id = ( SELECT current_store_id() AS current_store_id))))`
- **WITH CHECK:** `(( SELECT is_staff() AS is_staff) AND ((store_id IS NULL) OR (store_id = ( SELECT current_store_id() AS current_store_id))))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `message_templates_account_idx` — `CREATE INDEX message_templates_account_idx ON public.message_templates USING btree (whatsapp_account_id)`
- `message_templates_pkey` — `CREATE UNIQUE INDEX message_templates_pkey ON public.message_templates USING btree (id)`
- `message_templates_store_id_idx` — `CREATE INDEX message_templates_store_id_idx ON public.message_templates USING btree (store_id)`
- `message_templates_whatsapp_account_id_meta_template_name_me_key` — `CREATE UNIQUE INDEX message_templates_whatsapp_account_id_meta_template_name_me_key ON public.message_templates USING btree (whatsapp_account_id, meta_template_name, meta_language_code)`

**Constraints UNIQUE:** `message_templates_whatsapp_account_id_meta_template_name_me_key`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

**CHECK constraints (regras explícitas no banco) `[mecânico]`:**

- `message_templates_header_type_check`: `(header_type = ANY (ARRAY['none'::text, 'text'::text, 'image'::text, 'document'::text, 'video'::text]))`
- `message_templates_meta_category_check`: `(meta_category = ANY (ARRAY['utility'::text, 'marketing'::text, 'authentication'::text]))`
- `message_templates_meta_status_check`: `(meta_status = ANY (ARRAY['approved'::text, 'pending'::text, 'rejected'::text, 'paused'::text, 'unknown'::text]))`

`❓ pendente` — regras de negócio narrativas (o "porquê") a inferir na Fase 3 / confirmar com o humano.

## Perguntas pendentes

- _(nenhuma registrada ainda)_

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
