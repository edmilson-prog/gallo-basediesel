---
objeto: audit_logs
tipo: tabela
schema: public
status: existente
tier: estrutural
dominio: access
rls_enabled: true
colunas: 9
edge_functions: []
prds_relacionados: [PRD-006]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `audit_logs`

> Trilha de auditoria imutável de mutações. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** estrutural · **Domínio:** access · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | não | — | FK → `stores.id` |
| 3 | `actor_id` | uuid | não | — | FK → `sellers.id` |
| 4 | `action` | text | não | — | — |
| 5 | `resource` | text | não | — | — |
| 6 | `resource_id` | text | não | — | — |
| 7 | `before` | jsonb | sim | — | — |
| 8 | `after` | jsonb | sim | — | — |
| 9 | `timestamp` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `actor_id` → `sellers.id`
- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `audit_logs_no_delete` — DELETE · roles: `{authenticated}`
- **USING:** `false`

### `audit_logs_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `audit_logs_select` — SELECT · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (( SELECT current_app_role() AS current_app_role) = 'financeiro'::text)))`

### `audit_logs_no_update` — UPDATE · roles: `{authenticated}`
- **USING:** `false`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `audit_logs_action_idx` — `CREATE INDEX audit_logs_action_idx ON public.audit_logs USING btree (action)`
- `audit_logs_actor_id_idx` — `CREATE INDEX audit_logs_actor_id_idx ON public.audit_logs USING btree (actor_id)`
- `audit_logs_pkey` — `CREATE UNIQUE INDEX audit_logs_pkey ON public.audit_logs USING btree (id)`
- `audit_logs_resource_id_idx` — `CREATE INDEX audit_logs_resource_id_idx ON public.audit_logs USING btree (resource_id)`
- `audit_logs_resource_idx` — `CREATE INDEX audit_logs_resource_idx ON public.audit_logs USING btree (resource)`
- `audit_logs_store_id_idx` — `CREATE INDEX audit_logs_store_id_idx ON public.audit_logs USING btree (store_id)`
- `audit_logs_timestamp_idx` — `CREATE INDEX audit_logs_timestamp_idx ON public.audit_logs USING btree ("timestamp" DESC)`

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
