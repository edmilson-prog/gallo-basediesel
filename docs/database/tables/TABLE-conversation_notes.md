---
objeto: conversation_notes
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: conversations
rls_enabled: true
colunas: 9
edge_functions: []
prds_relacionados: [PRD-119]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `conversation_notes`

> Notas internas fixadas numa conversa. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** conversations · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: COMMENT ON conversation_notes, no próprio banco)`

> Internal attendant notes pinned to a conversation. Store-scoped, internal-only (never sent to the customer). mentions[] fans out to in-app notifications via trigger.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `conversation_id` | uuid | não | — | FK → `conversations.id` ‹on delete cascade› |
| 3 | `store_id` | uuid | não | — | FK → `stores.id` |
| 4 | `author_id` | uuid | não | — | FK → `sellers.id` |
| 5 | `content` | text | não | — | — |
| 6 | `mentions` | uuid[] | não | `'{}'::uuid[]` | — |
| 7 | `pinned` | boolean | não | `false` | — |
| 8 | `created_at` | timestamptz | não | `now()` | — |
| 9 | `updated_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `author_id` → `sellers.id`
- `conversation_id` → `conversations.id` — on delete `CASCADE`
- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `conversation_notes_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ((author_id = ( SELECT current_seller_id() AS current_seller_id)) OR ( SELECT is_staff() AS is_staff)))`

### `conversation_notes_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (author_id = ( SELECT current_seller_id() AS current_seller_id)))`

### `conversation_notes_select` — SELECT · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `conversation_notes_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ((author_id = ( SELECT current_seller_id() AS current_seller_id)) OR ( SELECT is_staff() AS is_staff)))`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ((author_id = ( SELECT current_seller_id() AS current_seller_id)) OR ( SELECT is_staff() AS is_staff)))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `conversation_notes_conversation_id_idx` — `CREATE INDEX conversation_notes_conversation_id_idx ON public.conversation_notes USING btree (conversation_id)`
- `conversation_notes_created_at_idx` — `CREATE INDEX conversation_notes_created_at_idx ON public.conversation_notes USING btree (created_at)`
- `conversation_notes_pkey` — `CREATE UNIQUE INDEX conversation_notes_pkey ON public.conversation_notes USING btree (id)`
- `conversation_notes_store_id_idx` — `CREATE INDEX conversation_notes_store_id_idx ON public.conversation_notes USING btree (store_id)`

## Triggers `[mecânico]`

- `conversation_notes_notify_mentions` — AFTER INSERT → `notify_conversation_note_mentions()`

## Regras de negócio

`❓ pendente` — regras de negócio narrativas (o "porquê") a inferir na Fase 3 / confirmar com o humano.

## Perguntas pendentes

- _(nenhuma registrada ainda)_

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
