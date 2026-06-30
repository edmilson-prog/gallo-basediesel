---
objeto: profiles
tipo: tabela
schema: public
status: existente
tier: estrutural
dominio: access
rls_enabled: true
colunas: 7
edge_functions: []
prds_relacionados: [PRD-107]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `profiles`

> Espelho de auth.users → papel/loja/seller (fonte do JWT). `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** estrutural · **Domínio:** access · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: COMMENT ON profiles, no próprio banco)`

> Maps auth.users to app role/store/seller (PRD-107). Source for JWT custom claims.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `auth_user_id` | uuid | não | — | **PK** |
| 2 | `seller_id` | uuid | sim | — | FK → `sellers.id` ‹on delete set null› |
| 3 | `store_id` | uuid | não | — | FK → `stores.id` |
| 4 | `role` | text | não | — | — |
| 5 | `display_name` | text | não | — | — |
| 6 | `email` | text | sim | — | — |
| 7 | `created_at` | timestamptz | não | `now()` | — |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `seller_id` → `sellers.id` — on delete `SET NULL`
- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- _nenhuma_

## RLS — Row Level Security `[regra: mecânico]`

### `profiles_select_auth_admin` — SELECT · roles: `{supabase_auth_admin}`
- **USING:** `true`

### `profiles_select_self_or_staff` — SELECT · roles: `{authenticated}`
- **USING:** `((auth_user_id = ( SELECT auth.uid() AS uid)) OR ((COALESCE(((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'role'::text), ''::text) = ANY (ARRAY['owner'::text, 'manager'::text])) AND ((((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'store_id'::text))::uuid = store_id)))`

**Justificativa do desenho:** `❓ pendente` — confirmar na Fase 3/4 (padrão de escopo por loja/seller/staff).

## Índices `[mecânico]`

- `idx_profiles_seller_id` — `CREATE INDEX idx_profiles_seller_id ON public.profiles USING btree (seller_id)`
- `idx_profiles_store_id` — `CREATE INDEX idx_profiles_store_id ON public.profiles USING btree (store_id)`
- `profiles_pkey` — `CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (auth_user_id)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

**CHECK constraints (regras explícitas no banco) `[mecânico]`:**

- `profiles_role_check`: `(role = ANY (ARRAY['owner'::text, 'manager'::text, 'seller_internal'::text, 'seller_external'::text, 'sdr'::text, 'financeiro'::text, 'b2b_customer'::text, 'b2c_customer'::text]))`

`❓ pendente` — regras de negócio narrativas (o "porquê") a inferir na Fase 3 / confirmar com o humano.

## Perguntas pendentes

- _(nenhuma registrada ainda)_

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
