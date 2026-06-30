---
objeto: departments
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: access
rls_enabled: true
colunas: 5
edge_functions: []
prds_relacionados: [PRD-211]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `departments`

> Departamentos: agrupamento de vendedores por loja. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** access · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: COMMENT ON departments, no próprio banco)`

> PRD-211: departments (revived ITeam). Store-scoped grouping of sellers with an optional manager. Membership is derived from sellers.department_id (no member column here).

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | text | não | `(gen_random_uuid())::text` | **PK** |
| 2 | `name` | text | não | — | — |
| 3 | `store_id` | uuid | não | — | FK → `stores.id` |
| 4 | `manager_id` | uuid | sim | — | FK → `sellers.id` |
| 5 | `created_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `manager_id` → `sellers.id`
- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- `rotation_participants.scope_department_id` → `departments.id`
- `sellers.department_id` → `departments.id`

## RLS — Row Level Security `[regra: mecânico]`

### `departments_write` — ALL · roles: `{authenticated}`
- **USING:** `( SELECT is_staff() AS is_staff)`
- **WITH CHECK:** `( SELECT is_staff() AS is_staff)`

### `departments_select` — SELECT · roles: `{authenticated}`
- **USING:** `true`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `departments_pkey` — `CREATE UNIQUE INDEX departments_pkey ON public.departments USING btree (id)`
- `idx_departments_store` — `CREATE INDEX idx_departments_store ON public.departments USING btree (store_id)`

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
