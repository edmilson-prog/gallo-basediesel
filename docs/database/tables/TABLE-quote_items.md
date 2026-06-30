---
objeto: quote_items
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: commercial
rls_enabled: true
colunas: 9
edge_functions: []
prds_relacionados: [PRD-012]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `quote_items`

> Item de um orçamento (filho de quotes). `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** commercial · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `quote_id` | uuid | não | — | FK → `quotes.id` ‹on delete cascade› |
| 3 | `part_id` | uuid | não | — | FK → `parts.id` |
| 4 | `part_sku` | text | não | — | — |
| 5 | `part_name` | text | não | — | — |
| 6 | `quantity` | numeric | não | `0` | — |
| 7 | `unit_price` | numeric | não | `0` | — |
| 8 | `discount` | numeric | não | `0` | — |
| 9 | `total` | numeric | não | `0` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `part_id` → `parts.id`
- `quote_id` → `quotes.id` — on delete `CASCADE`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `quote_items_delete` — DELETE · roles: `{authenticated}`
- **USING:** `(quote_id IN ( SELECT quotes.id FROM quotes WHERE (quotes.store_id = ( SELECT current_store_id() AS current_store_id))))`

### `quote_items_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `(quote_id IN ( SELECT quotes.id FROM quotes WHERE (quotes.store_id = ( SELECT current_store_id() AS current_store_id))))`

### `quote_items_select` — SELECT · roles: `{authenticated}`
- **USING:** `(quote_id IN ( SELECT quotes.id FROM quotes WHERE (quotes.store_id = ( SELECT current_store_id() AS current_store_id))))`

### `quote_items_update` — UPDATE · roles: `{authenticated}`
- **USING:** `(quote_id IN ( SELECT quotes.id FROM quotes WHERE (quotes.store_id = ( SELECT current_store_id() AS current_store_id))))`
- **WITH CHECK:** `(quote_id IN ( SELECT quotes.id FROM quotes WHERE (quotes.store_id = ( SELECT current_store_id() AS current_store_id))))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `quote_items_part_id_idx` — `CREATE INDEX quote_items_part_id_idx ON public.quote_items USING btree (part_id)`
- `quote_items_pkey` — `CREATE UNIQUE INDEX quote_items_pkey ON public.quote_items USING btree (id)`
- `quote_items_quote_id_idx` — `CREATE INDEX quote_items_quote_id_idx ON public.quote_items USING btree (quote_id)`

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
