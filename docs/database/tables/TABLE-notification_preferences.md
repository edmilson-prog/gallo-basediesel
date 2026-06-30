---
objeto: notification_preferences
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: notifications
rls_enabled: true
colunas: 5
edge_functions: []
prds_relacionados: [PRD-024]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `notification_preferences`

> Preferências de notificação por vendedor. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** notifications · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `recipient_id` | text | não | — | **PK** |
| 2 | `recipient_type` | text | não | — | — |
| 3 | `matrix` | jsonb | não | — | — |
| 4 | `quiet_hours` | jsonb | sim | — | — |
| 5 | `updated_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- _nenhuma_

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `notification_preferences_delete` — DELETE · roles: `{authenticated}`
- **USING:** `(( SELECT is_staff() AS is_staff) OR (recipient_id = (( SELECT current_seller_id() AS current_seller_id))::text))`

### `notification_preferences_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `(( SELECT is_staff() AS is_staff) OR (recipient_id = (( SELECT current_seller_id() AS current_seller_id))::text))`

### `notification_preferences_select` — SELECT · roles: `{authenticated}`
- **USING:** `(( SELECT is_staff() AS is_staff) OR (recipient_id = (( SELECT current_seller_id() AS current_seller_id))::text))`

### `notification_preferences_update` — UPDATE · roles: `{authenticated}`
- **USING:** `(( SELECT is_staff() AS is_staff) OR (recipient_id = (( SELECT current_seller_id() AS current_seller_id))::text))`
- **WITH CHECK:** `(( SELECT is_staff() AS is_staff) OR (recipient_id = (( SELECT current_seller_id() AS current_seller_id))::text))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `notification_preferences_pkey` — `CREATE UNIQUE INDEX notification_preferences_pkey ON public.notification_preferences USING btree (recipient_id)`

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
