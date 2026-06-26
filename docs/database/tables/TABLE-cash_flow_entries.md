---
objeto: cash_flow_entries
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: finance
rls_enabled: true
colunas: 11
edge_functions: []
prds_relacionados: [PRD-021]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `cash_flow_entries`

> Lançamentos de fluxo de caixa. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** finance · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `type` | text | não | — | — |
| 3 | `source` | text | não | — | — |
| 4 | `source_id` | text | sim | — | — |
| 5 | `description` | text | não | — | — |
| 6 | `amount` | numeric | não | — | — |
| 7 | `date` | timestamptz | não | — | — |
| 8 | `status` | text | não | `'realizado'::text` | — |
| 9 | `store_id` | uuid | não | — | FK → `stores.id` |
| 10 | `created_by` | uuid | sim | — | FK → `sellers.id` |
| 11 | `created_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `created_by` → `sellers.id`
- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `cash_flow_entries_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

### `cash_flow_entries_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

### `cash_flow_entries_select` — SELECT · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

### `cash_flow_entries_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `cash_flow_entries_date_idx` — `CREATE INDEX cash_flow_entries_date_idx ON public.cash_flow_entries USING btree (date)`
- `cash_flow_entries_pkey` — `CREATE UNIQUE INDEX cash_flow_entries_pkey ON public.cash_flow_entries USING btree (id)`
- `cash_flow_entries_store_id_idx` — `CREATE INDEX cash_flow_entries_store_id_idx ON public.cash_flow_entries USING btree (store_id)`
- `idx_cash_flow_entries_created_by` — `CREATE INDEX idx_cash_flow_entries_created_by ON public.cash_flow_entries USING btree (created_by)`

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
