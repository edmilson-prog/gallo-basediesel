---
objeto: whatsapp_account_access_rules
tipo: tabela
schema: public
status: existente
tier: suporte
dominio: conversations
rls_enabled: true
colunas: 5
edge_functions: []
prds_relacionados: [Switchboard]
atualizado_em: 2026-06-17
fonte_contexto: pendente
---

# `whatsapp_account_access_rules`

> Regras de acesso por número WhatsApp (multi-instância). `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** suporte · **Domínio:** conversations · **RLS:** habilitada

## Descrição da entidade

`❓ pendente` — descrição a inferir na Fase 3 (código/migrations) ou confirmar com o humano.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `whatsapp_account_id` | uuid | não | — | FK → `whatsapp_accounts.id` ‹on delete cascade› |
| 3 | `kind` | text | não | — | — |
| 4 | `target_value` | text | não | — | — |
| 5 | `created_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `whatsapp_account_id` → `whatsapp_accounts.id` — on delete `CASCADE`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `waar_staff_all` — ALL · roles: `{authenticated}`
- **USING:** `(EXISTS ( SELECT 1 FROM whatsapp_accounts a WHERE ((a.id = whatsapp_account_access_rules.whatsapp_account_id) AND (a.store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))))`
- **WITH CHECK:** `(EXISTS ( SELECT 1 FROM whatsapp_accounts a WHERE ((a.id = whatsapp_account_access_rules.whatsapp_account_id) AND (a.store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `waar_account_idx` — `CREATE INDEX waar_account_idx ON public.whatsapp_account_access_rules USING btree (whatsapp_account_id)`
- `whatsapp_account_access_rules_pkey` — `CREATE UNIQUE INDEX whatsapp_account_access_rules_pkey ON public.whatsapp_account_access_rules USING btree (id)`
- `whatsapp_account_access_rules_whatsapp_account_id_kind_targ_key` — `CREATE UNIQUE INDEX whatsapp_account_access_rules_whatsapp_account_id_kind_targ_key ON public.whatsapp_account_access_rules USING btree (whatsapp_account_id, kind, target_value)`

**Constraints UNIQUE:** `whatsapp_account_access_rules_whatsapp_account_id_kind_targ_key`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

**CHECK constraints (regras explícitas no banco) `[mecânico]`:**

- `whatsapp_account_access_rules_kind_check`: `(kind = ANY (ARRAY['seller'::text, 'role'::text, 'store'::text]))`

`❓ pendente` — regras de negócio narrativas (o "porquê") a inferir na Fase 3 / confirmar com o humano.

## Perguntas pendentes

- _(nenhuma registrada ainda)_

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
