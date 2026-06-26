---
objeto: roles
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: access
rls_enabled: true
colunas: 10
edge_functions: []
prds_relacionados: [PRD-211]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `roles`

> Papéis (RBAC) editáveis, com base_role. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** access · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: COMMENT ON roles, no próprio banco)`

> RBAC roles (PRD-211). System roles use id = slug and store_id = null; custom roles are store-scoped.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | text | não | — | **PK** |
| 2 | `slug` | text | não | — | — |
| 3 | `name` | text | não | — | — |
| 4 | `description` | text | sim | — | — |
| 5 | `is_system` | boolean | não | `false` | — |
| 6 | `is_owner_immutable` | boolean | não | `false` | — |
| 7 | `base_role` | text | não | — | — |
| 8 | `store_id` | uuid | sim | — | FK → `stores.id` |
| 9 | `created_at` | timestamptz | não | `now()` | — |
| 10 | `updated_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- `role_permissions.role_id` → `roles.id`

## RLS — Row Level Security `[regra: mecânico]`

### `roles_write` — ALL · roles: `{authenticated}`
- **USING:** `(( SELECT current_app_role() AS current_app_role) = 'owner'::text)`
- **WITH CHECK:** `(( SELECT current_app_role() AS current_app_role) = 'owner'::text)`

### `roles_select` — SELECT · roles: `{authenticated}`
- **USING:** `true`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `roles_pkey` — `CREATE UNIQUE INDEX roles_pkey ON public.roles USING btree (id)`
- `roles_slug_key` — `CREATE UNIQUE INDEX roles_slug_key ON public.roles USING btree (slug)`

**Constraints UNIQUE:** `roles_slug_key`

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
