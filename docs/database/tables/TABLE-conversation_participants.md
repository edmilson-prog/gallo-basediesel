---
objeto: conversation_participants
tipo: tabela
schema: public
status: existente
tier: estrutural
dominio: conversations
rls_enabled: true
colunas: 4
edge_functions: []
prds_relacionados: [Switchboard]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `conversation_participants`

> Junção conversa↔seller co-responsável (multi-instância). `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** estrutural · **Domínio:** conversations · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `conversation_id` | uuid | não | — | **PK** · FK → `conversations.id` ‹on delete cascade› |
| 2 | `seller_id` | uuid | não | — | **PK** · FK → `sellers.id` |
| 3 | `added_by` | uuid | sim | — | FK → `sellers.id` |
| 4 | `added_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `added_by` → `sellers.id`
- `conversation_id` → `conversations.id` — on delete `CASCADE`
- `seller_id` → `sellers.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `cp_write` — ALL · roles: `{authenticated}`
- **USING:** `(( SELECT is_staff() AS is_staff) OR (EXISTS ( SELECT 1 FROM conversations c WHERE ((c.id = conversation_participants.conversation_id) AND (c.assigned_seller_id = ( SELECT current_seller_id() AS current_seller_id))))))`
- **WITH CHECK:** `(( SELECT is_staff() AS is_staff) OR (EXISTS ( SELECT 1 FROM conversations c WHERE ((c.id = conversation_participants.conversation_id) AND (c.assigned_seller_id = ( SELECT current_seller_id() AS current_seller_id))))))`

### `cp_select` — SELECT · roles: `{authenticated}`
- **USING:** `(( SELECT is_staff() AS is_staff) OR (seller_id = ( SELECT current_seller_id() AS current_seller_id)) OR (EXISTS ( SELECT 1 FROM conversations c WHERE ((c.id = conversation_participants.conversation_id) AND (c.assigned_seller_id = ( SELECT current_seller_id() AS current_seller_id))))))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `conversation_participants_pkey` — `CREATE UNIQUE INDEX conversation_participants_pkey ON public.conversation_participants USING btree (conversation_id, seller_id)`
- `cp_seller_idx` — `CREATE INDEX cp_seller_idx ON public.conversation_participants USING btree (seller_id)`

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
