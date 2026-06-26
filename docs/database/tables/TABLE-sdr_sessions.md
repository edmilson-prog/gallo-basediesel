---
objeto: sdr_sessions
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: sdr
rls_enabled: true
colunas: 9
edge_functions: []
prds_relacionados: [PRD-029]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `sdr_sessions`

> Sessões do agente SDR. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** sdr · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `conversation_id` | uuid | não | — | FK → `conversations.id` |
| 3 | `state` | text | não | — | — |
| 4 | `collected_data` | jsonb | não | `'{}'::jsonb` | — |
| 5 | `last_activity_at` | timestamptz | não | — | — |
| 6 | `started_at` | timestamptz | não | — | — |
| 7 | `finished_at` | timestamptz | sim | — | — |
| 8 | `finish_reason` | text | sim | — | — |
| 9 | `paused_from_state` | text | sim | — | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `conversation_id` → `conversations.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `sdr_sessions_delete` — DELETE · roles: `{authenticated}`
- **USING:** `(conversation_id IN ( SELECT conversations.id FROM conversations WHERE (conversations.store_id = ( SELECT current_store_id() AS current_store_id))))`

### `sdr_sessions_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `(conversation_id IN ( SELECT conversations.id FROM conversations WHERE (conversations.store_id = ( SELECT current_store_id() AS current_store_id))))`

### `sdr_sessions_select` — SELECT · roles: `{authenticated}`
- **USING:** `(conversation_id IN ( SELECT conversations.id FROM conversations WHERE (conversations.store_id = ( SELECT current_store_id() AS current_store_id))))`

### `sdr_sessions_update` — UPDATE · roles: `{authenticated}`
- **USING:** `(conversation_id IN ( SELECT conversations.id FROM conversations WHERE (conversations.store_id = ( SELECT current_store_id() AS current_store_id))))`
- **WITH CHECK:** `(conversation_id IN ( SELECT conversations.id FROM conversations WHERE (conversations.store_id = ( SELECT current_store_id() AS current_store_id))))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `sdr_sessions_conversation_id_idx` — `CREATE INDEX sdr_sessions_conversation_id_idx ON public.sdr_sessions USING btree (conversation_id)`
- `sdr_sessions_pkey` — `CREATE UNIQUE INDEX sdr_sessions_pkey ON public.sdr_sessions USING btree (id)`
- `sdr_sessions_started_at_idx` — `CREATE INDEX sdr_sessions_started_at_idx ON public.sdr_sessions USING btree (started_at DESC)`
- `sdr_sessions_state_idx` — `CREATE INDEX sdr_sessions_state_idx ON public.sdr_sessions USING btree (state)`

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
