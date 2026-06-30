---
objeto: customer_notes
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: crm
rls_enabled: true
colunas: 5
edge_functions: []
prds_relacionados: [PRD-008]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `customer_notes`

> Notas da ficha do cliente. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** crm · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `customer_id` | uuid | não | — | FK → `customers.id` ‹on delete cascade› |
| 3 | `author_id` | uuid | não | — | FK → `sellers.id` |
| 4 | `content` | text | não | — | — |
| 5 | `created_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `author_id` → `sellers.id`
- `customer_id` → `customers.id` — on delete `CASCADE`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `customer_notes_delete` — DELETE · roles: `{authenticated}`
- **USING:** `(customer_id IN ( SELECT customers.id FROM customers WHERE (customers.store_id = ( SELECT current_store_id() AS current_store_id))))`

### `customer_notes_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `(customer_id IN ( SELECT customers.id FROM customers WHERE (customers.store_id = ( SELECT current_store_id() AS current_store_id))))`

### `customer_notes_select` — SELECT · roles: `{authenticated}`
- **USING:** `(customer_id IN ( SELECT customers.id FROM customers WHERE (customers.store_id = ( SELECT current_store_id() AS current_store_id))))`

### `customer_notes_update` — UPDATE · roles: `{authenticated}`
- **USING:** `(customer_id IN ( SELECT customers.id FROM customers WHERE (customers.store_id = ( SELECT current_store_id() AS current_store_id))))`
- **WITH CHECK:** `(customer_id IN ( SELECT customers.id FROM customers WHERE (customers.store_id = ( SELECT current_store_id() AS current_store_id))))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `customer_notes_created_at_idx` — `CREATE INDEX customer_notes_created_at_idx ON public.customer_notes USING btree (created_at)`
- `customer_notes_customer_id_idx` — `CREATE INDEX customer_notes_customer_id_idx ON public.customer_notes USING btree (customer_id)`
- `customer_notes_pkey` — `CREATE UNIQUE INDEX customer_notes_pkey ON public.customer_notes USING btree (id)`
- `idx_customer_notes_author_id` — `CREATE INDEX idx_customer_notes_author_id ON public.customer_notes USING btree (author_id)`

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
