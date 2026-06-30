---
objeto: expenses
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: finance
rls_enabled: true
colunas: 19
edge_functions: []
prds_relacionados: [PRD-020]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `expenses`

> Despesas (com recorrência/série). `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** finance · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `description` | text | não | — | — |
| 3 | `category` | text | não | — | — |
| 4 | `amount` | numeric | não | `0` | — |
| 5 | `competence_date` | timestamptz | não | — | — |
| 6 | `payment_date` | timestamptz | sim | — | — |
| 7 | `status` | text | não | `'pendente'::text` | — |
| 8 | `due_date` | timestamptz | sim | — | — |
| 9 | `is_recurring` | boolean | não | `false` | — |
| 10 | `recurrence_parent_id` | uuid | sim | — | FK → `expenses.id` |
| 11 | `recurrence_config` | jsonb | sim | — | — |
| 12 | `supplier` | text | sim | — | — |
| 13 | `payment_method` | text | sim | — | — |
| 14 | `attachment_url` | text | sim | — | — |
| 15 | `notes` | text | sim | — | — |
| 16 | `store_id` | uuid | não | — | FK → `stores.id` |
| 17 | `created_by` | text | não | — | — |
| 18 | `created_at` | timestamptz | não | `now()` | — |
| 19 | `updated_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `recurrence_parent_id` → `expenses.id`
- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- `expenses.recurrence_parent_id` → `expenses.id`

## RLS — Row Level Security `[regra: mecânico]`

### `expenses_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

### `expenses_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

### `expenses_select` — SELECT · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

### `expenses_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `expenses_category_idx` — `CREATE INDEX expenses_category_idx ON public.expenses USING btree (category)`
- `expenses_competence_date_idx` — `CREATE INDEX expenses_competence_date_idx ON public.expenses USING btree (competence_date)`
- `expenses_due_date_idx` — `CREATE INDEX expenses_due_date_idx ON public.expenses USING btree (due_date)`
- `expenses_payment_date_idx` — `CREATE INDEX expenses_payment_date_idx ON public.expenses USING btree (payment_date)`
- `expenses_pkey` — `CREATE UNIQUE INDEX expenses_pkey ON public.expenses USING btree (id)`
- `expenses_recurrence_parent_id_idx` — `CREATE INDEX expenses_recurrence_parent_id_idx ON public.expenses USING btree (recurrence_parent_id)`
- `expenses_status_idx` — `CREATE INDEX expenses_status_idx ON public.expenses USING btree (status)`
- `expenses_store_id_idx` — `CREATE INDEX expenses_store_id_idx ON public.expenses USING btree (store_id)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

**CHECK constraints (regras explícitas no banco) `[mecânico]`:**

- `expenses_category_check`: `(category = ANY (ARRAY['folha'::text, 'aluguel'::text, 'infraestrutura'::text, 'marketing'::text, 'impostos'::text, 'fornecedores'::text, 'logistica'::text, 'manutencao'::text, 'outros'::text]))`
- `expenses_payment_method_check`: `((payment_method IS NULL) OR (payment_method = ANY (ARRAY['pix'::text, 'boleto'::text, 'transferencia'::text, 'dinheiro'::text, 'cartao'::text, 'debito_automatico'::text])))`
- `expenses_status_check`: `(status = ANY (ARRAY['pendente'::text, 'pago'::text, 'atrasado'::text, 'cancelado'::text]))`

`❓ pendente` — regras de negócio narrativas (o "porquê") a inferir na Fase 3 / confirmar com o humano.

## Perguntas pendentes

- _(nenhuma registrada ainda)_

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
