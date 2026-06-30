---
objeto: rotation_participants
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: conversations
rls_enabled: true
colunas: 8
edge_functions: []
prds_relacionados: [PRD-213]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `rotation_participants`

> Participantes da fila de rodízio. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** conversations · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: COMMENT ON rotation_participants, no próprio banco)`

> PRD-213: queue participants. scope_department_id null = top-level; set = internal member of that department. last_assigned_member_id is the per-department internal pointer (on the department row).

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `queue_id` | uuid | não | — | FK → `rotation_queues.id` ‹on delete cascade› |
| 3 | `scope_department_id` | text | sim | — | FK → `departments.id` ‹on delete cascade› |
| 4 | `ref_type` | text | não | — | — |
| 5 | `ref_id` | text | não | — | — |
| 6 | `order` | integer | não | `0` | — |
| 7 | `enabled` | boolean | não | `true` | — |
| 8 | `last_assigned_member_id` | text | sim | — | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `queue_id` → `rotation_queues.id` — on delete `CASCADE`
- `scope_department_id` → `departments.id` — on delete `CASCADE`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `rotation_participants_write` — ALL · roles: `{authenticated}`
- **USING:** `( SELECT is_staff() AS is_staff)`
- **WITH CHECK:** `( SELECT is_staff() AS is_staff)`

### `rotation_participants_select` — SELECT · roles: `{authenticated}`
- **USING:** `true`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `idx_rotation_participants_queue` — `CREATE INDEX idx_rotation_participants_queue ON public.rotation_participants USING btree (queue_id)`
- `idx_rotation_participants_scope` — `CREATE INDEX idx_rotation_participants_scope ON public.rotation_participants USING btree (scope_department_id)`
- `rotation_participants_pkey` — `CREATE UNIQUE INDEX rotation_participants_pkey ON public.rotation_participants USING btree (id)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

**CHECK constraints (regras explícitas no banco) `[mecânico]`:**

- `rotation_participants_ref_type_check`: `(ref_type = ANY (ARRAY['seller'::text, 'department'::text]))`

`❓ pendente` — regras de negócio narrativas (o "porquê") a inferir na Fase 3 / confirmar com o humano.

## Perguntas pendentes

- _(nenhuma registrada ainda)_

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
