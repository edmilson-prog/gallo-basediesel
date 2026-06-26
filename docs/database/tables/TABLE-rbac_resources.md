---
objeto: rbac_resources
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

# `rbac_resources`

> Catálogo de recursos protegíveis (RBAC). `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** access · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: COMMENT ON rbac_resources, no próprio banco)`

> RBAC resource catalog (PRD-211). One row per protectable resource; mirrors RESOURCES.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `key` | text | não | — | **PK** |
| 2 | `label` | text | não | — | — |
| 3 | `group` | text | não | — | — |
| 4 | `sort_order` | integer | não | `0` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- _nenhuma_

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `rbac_resources_write` — ALL · roles: `{authenticated}`
- **USING:** `(( SELECT current_app_role() AS current_app_role) = 'owner'::text)`
- **WITH CHECK:** `(( SELECT current_app_role() AS current_app_role) = 'owner'::text)`

### `rbac_resources_select` — SELECT · roles: `{authenticated}`
- **USING:** `true`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `rbac_resources_pkey` — `CREATE UNIQUE INDEX rbac_resources_pkey ON public.rbac_resources USING btree (key)`

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
