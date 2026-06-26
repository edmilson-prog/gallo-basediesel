---
objeto: rotation_queues
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: conversations
rls_enabled: true
colunas: 7
edge_functions: []
prds_relacionados: [PRD-213]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `rotation_queues`

> Fila de rodízio de atendimento, uma por loja. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** conversations · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: COMMENT ON rotation_queues, no próprio banco)`

> PRD-213: attendance rotation queue, one per store. targetMode direct|department; last_assigned_ref_id is the fairness pointer.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | não | — | FK → `stores.id` |
| 3 | `target_mode` | text | não | `'direct'::text` | — |
| 4 | `last_assigned_ref_id` | text | sim | — | — |
| 5 | `skip_offline` | boolean | não | `true` | — |
| 6 | `created_at` | timestamptz | não | `now()` | — |
| 7 | `updated_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- `rotation_participants.queue_id` → `rotation_queues.id`

## RLS — Row Level Security `[regra: mecânico]`

### `rotation_queues_write` — ALL · roles: `{authenticated}`
- **USING:** `( SELECT is_staff() AS is_staff)`
- **WITH CHECK:** `( SELECT is_staff() AS is_staff)`

### `rotation_queues_select` — SELECT · roles: `{authenticated}`
- **USING:** `true`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `rotation_queues_pkey` — `CREATE UNIQUE INDEX rotation_queues_pkey ON public.rotation_queues USING btree (id)`
- `rotation_queues_store_id_key` — `CREATE UNIQUE INDEX rotation_queues_store_id_key ON public.rotation_queues USING btree (store_id)`

**Constraints UNIQUE:** `rotation_queues_store_id_key`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

**CHECK constraints (regras explícitas no banco) `[mecânico]`:**

- `rotation_queues_target_mode_check`: `(target_mode = ANY (ARRAY['direct'::text, 'department'::text]))`

`❓ pendente` — regras de negócio narrativas (o "porquê") a inferir na Fase 3 / confirmar com o humano.

## Perguntas pendentes

- _(nenhuma registrada ainda)_

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
