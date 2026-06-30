---
objeto: role_permissions
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: access
rls_enabled: true
colunas: 4
edge_functions: []
prds_relacionados: [PRD-211]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `role_permissions`

> Matriz de permissões por papel. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** access · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: COMMENT ON role_permissions, no próprio banco)`

> RBAC permissions per role (PRD-211). One row per (role, resource); mirrors PERMISSIONS_MATRIX.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `role_id` | text | não | — | **PK** · FK → `roles.id` ‹on delete cascade› |
| 2 | `resource` | text | não | — | **PK** |
| 3 | `actions` | text[] | não | `'{}'::text[]` | — |
| 4 | `scope` | text | não | `'own'::text` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `role_id` → `roles.id` — on delete `CASCADE`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `role_permissions_write` — ALL · roles: `{authenticated}`
- **USING:** `(( SELECT current_app_role() AS current_app_role) = 'owner'::text)`
- **WITH CHECK:** `(( SELECT current_app_role() AS current_app_role) = 'owner'::text)`

### `role_permissions_select` — SELECT · roles: `{authenticated}`
- **USING:** `true`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `role_permissions_pkey` — `CREATE UNIQUE INDEX role_permissions_pkey ON public.role_permissions USING btree (role_id, resource)`
- `role_permissions_role_id_idx` — `CREATE INDEX role_permissions_role_id_idx ON public.role_permissions USING btree (role_id)`

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
