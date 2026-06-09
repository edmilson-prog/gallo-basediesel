# RLS — Fase 2 (MVP adaptado) — write policies

> **PRDs relacionados:** PRD-103 (RLS) e PRD-107 (Auth custom claims). Este documento registra a **implementação MVP adaptada** aplicada em 2026-06-08, que diverge do PRD-103 original em dois pontos (schema e fonte de identidade) — ver abaixo. O PRD-107 (Fase 1) iniciou a **transição da identidade para claims do JWT** (com fallback para a subquery) — ver seção "Funções helper de identidade".
> **Aplicação:** migrations versionadas no remoto via MCP (`apply_migration`). Nomes: `rls_helpers_identity`, `rls_policies_store_direct`, `rls_policies_derived_global`, `rls_helpers_security_invoker`, `rls_helpers_jwt_claims_with_fallback`, `add_manager_id_to_stores`, `rls_per_seller_carteira_scope`, `profiles_select_staff`, `rls_slice2_financial_staff_only`, `rls_slice3_personal_assets`, `rls_slice4_personal_derived`, `perf_index_unindexed_fks`, `profiles_select_consolidate_initplan`, `storefront_anon_read`, `perf_initplan_wrap_helpers`, `rls_helpers_drop_profiles_fallback`.

## Por que "adaptado"

O PRD-103 foi escrito para schemas `crm` + `storefront` e identidade via **JWT claims** (`auth.jwt() -> 'app_metadata'`), que dependem do **Custom Access Token Hook** (PRD-107). A realidade materializada é:

| PRD-103 assume                    | Realidade                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| schemas `crm` + `storefront`      | schema **`public`**                                                                                           |
| identidade via JWT `app_metadata` | hook **desligado** → identidade resolvida por **subquery em `public.profiles`** (`auth_user_id = auth.uid()`) |

Aplicar o PRD literal **bloquearia tudo** (helpers leem JWT vazio → fail closed). A decisão (Opção A) foi: **profiles-subquery, MVP pragmático** — escopo por loja real, funciona já, e migra para JWT depois sem reescrever policy (basta trocar o corpo das helpers).

## Funções helper de identidade

`SECURITY INVOKER`, `STABLE`, `set search_path = ''`. `EXECUTE` concedido apenas a `authenticated` (revogado de `public`/`anon`).

**Estado atual (migration `rls_helpers_drop_profiles_fallback`):** com o hook do JWT **universal**, as helpers leem a identidade **só do claim** (`auth.jwt() -> 'app_metadata'`) — o JWT é a **fonte única de verdade** e o sistema é **fail-closed** (sem `app_metadata` → identidade `null` → RLS nega). `is_staff()` segue derivando de `current_app_role()`.

```sql
create or replace function public.current_store_id()
returns uuid language sql stable security invoker set search_path = '' as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'store_id', '')::uuid;
$$;
-- idem: current_seller_id() (seller_id), current_app_role() (role, sem cast)
create or replace function public.is_staff()
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(public.current_app_role() in ('owner','manager'), false);
$$;
```

> **Histórico:** a migration anterior `rls_helpers_jwt_claims_with_fallback` usava `coalesce(claim, (subquery em public.profiles))` para um cutover **sem janela de lockout** (token velho / hook não habilitado → fallback idêntico ao comportamento anterior). Com o hook habilitado (Dashboard, 2026-06-08), o claim sempre vem preenchido → o subquery virou código morto em runtime e foi removido. As policies **nunca** mudaram nessa transição.

### Validação por impersonação (migration `rls_helpers_jwt_claims_with_fallback`)

| Teste | Cenário                                                 | Resultado                                                     |
| ----- | ------------------------------------------------------- | ------------------------------------------------------------- |
| A     | `sub` ausente de `profiles` + `app_metadata` nas claims | store=matriz, role=owner, staff=true → identidade veio do JWT |
| B     | `sub` real do owner, **sem** `app_metadata`             | store=matriz, role=owner, staff=true → fallback `profiles`    |
| C     | owner via claims lê dados                               | 70 customers, 477 orders, 693 messages → sem regressão        |
| D     | `sub` desconhecido, sem claims                          | store=`<null>`, 0 customers → fail-closed                     |

## Escopo por tabela

| Bucket                    | Tabelas                                                                                                                                                                                                                                                                                                                                 | Regra (SELECT/INSERT/UPDATE/DELETE)                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Store-direto** (23)     | customers, orders, quotes, leads, conversations, parts, commissions, expenses, cash_flow_entries, goals, media_assets, recommendations, carteira_transfers, distribution_traces, product_indicators, quick_replies, scheduled_sends, sdr_escalations, trackable_links, whatsapp_accounts, model_kits, asset_combos, asset_library_items | `store_id = public.current_store_id()`                                      |
| **Derivado via pai** (10) | order_items→orders, quote_items→quotes, messages→conversations, sdr_sessions→conversations, vehicles→customers, customer_notes→customers, model_kit_items→model_kits, customer_segments→sellers, asset_favorites→sellers, asset_send_log→sellers                                                                                        | `<fk> in (select id from <pai> where store_id = public.current_store_id())` |
| **Global** (1)            | vehicle_models                                                                                                                                                                                                                                                                                                                          | SELECT: `authenticated` (todos); escrita: `public.is_staff()`               |
| **Especial** (3)          | `audit_logs` (imutável: SELECT/INSERT por loja, UPDATE/DELETE `using(false)`) · `sellers` (escrita `is_staff()` + self-update do próprio `auth_user_id`) · `stores` (SELECT/UPDATE só a própria, sem INSERT/DELETE no cliente)                                                                                                          | —                                                                           |

Padrão de nome: `<tabela>_<select|insert|update|delete>`. `anon` **não** tem policy no CRM (fechou o vazamento das policies temporárias `*_select_poc_temp`, que permitiam `anon using(true)`).

## Validação (impersonando o owner)

`begin; select set_config('request.jwt.claims', '{"sub":"<auth_user_id>","role":"authenticated"}', true); set local role authenticated; … rollback;`

- **Leitura:** customers 70, orders 477, order_items 1511, messages 693, vehicles 60, vehicle_models 21 — ✅
- **Escrita same-store:** UPDATE afeta linhas — ✅
- **Isolamento:** usuário sem perfil → `current_store_id()` NULL + 0 linhas em tudo (fail closed) — ✅
- **`get_advisors(security)`:** sem erros; resta só `auth_leaked_password_protection` (config de dashboard, não relacionado).

## RBAC fino — isolamento de carteira por vendedor (Slice 1, migration `rls_per_seller_carteira_scope`)

Nas 6 tabelas-núcleo com dono, os **4 comandos** trocaram `store_id = current_store_id()` por:

```
store_id = current_store_id() AND (is_staff() OR <col> = current_seller_id())
```

| Tabela                                        | coluna de dono       |
| --------------------------------------------- | -------------------- |
| customers, orders, quotes, leads, commissions | `seller_id`          |
| conversations                                 | `assigned_seller_id` |

**Staff (owner/manager) seguem com escopo de loja** (`is_staff()` curto-circuita). Só **não-staff** sentem o recorte por carteira. As **tabelas-filhas herdam automaticamente** — o `<fk> in (select id from <pai> …)` roda sob a RLS do pai, então o escopo por vendedor se propaga sem alterá-las.

Validação por impersonação (claims com `app_metadata`):

| Persona                   | staff | customers | orders | quotes | conversations | order_items (filha) | messages (filha) |
| ------------------------- | ----- | --------- | ------ | ------ | ------------- | ------------------- | ---------------- |
| Lucas (`seller_internal`) | false | 18        | 132    | 10     | 28            | 423                 | 230              |
| Owner                     | true  | 70        | 477    | 80     | 96            | 1511                | 693              |

Vazamento cruzado (impersonando Lucas): `customers` de outro vendedor → 0; `orders` do Fernando → 0; `conversations` não-atribuídas → 0. ✅

**Deferido neste slice:** assets pessoais (`quick_replies`/`asset_combos.owner_id` — resolvido no Slice 3); semântica do pool de não-atribuídos; edge de `conversations.create` disparado por vendedor. (Financeiras/gerenciais resolvidas no Slice 2.)

## RBAC fino — financeiras staff-only + per-seller (Slice 2, migration `rls_slice2_financial_staff_only`)

Não há tabela de DRE/estoque/movimentação (computados de `orders`/`expenses`). O financeiro vive em `expenses`/`cash_flow_entries`.

**2a — staff-only** (`store_id = current_store_id() AND is_staff()`), nos 4 comandos — não-staff **não vê nada**:

| Tabela                | Motivo                                |
| --------------------- | ------------------------------------- |
| `expenses`            | despesas da loja (P&L)                |
| `cash_flow_entries`   | fluxo de caixa                        |
| `distribution_traces` | auditoria de distribuição (gerencial) |

**2b — per-seller** (`store_id = current_store_id() AND (is_staff() OR seller_id = current_seller_id())`), nos 4 comandos — antes store-wide (vazavam cross-seller):

| Tabela                                           | coluna                                                          |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `goals`, `recommendations`, `product_indicators` | `seller_id` (linhas nível-loja com `seller_id` null → só staff) |

Validação por impersonação:

| Persona                   | expenses | cash_flow | distribution_traces | goals | recommendations | product_indicators |
| ------------------------- | -------- | --------- | ------------------- | ----- | --------------- | ------------------ |
| Lucas (`seller_internal`) | 0        | 0         | 0                   | 24    | 12              | 2                  |
| Owner                     | 120      | 5         | 40                  | 85    | 25              | 10                 |

`get_advisors(security)` → nada novo (só `auth_leaked_password_protection`, config de dashboard).

## RBAC fino — assets pessoais por `owner_id` (Slice 3, migration `rls_slice3_personal_assets`)

As duas tabelas com dono pessoal (`owner_id` uuid → `sellers.id`) trocaram `store_id = current_store_id()` por:

```
store_id = current_store_id() AND (is_staff() OR owner_id = current_seller_id())
```

nos 4 comandos — com **uma exceção no SELECT de `quick_replies`**, que também expõe os snippets `scope = 'shared'` a toda a loja:

```
-- quick_replies SELECT
store_id = current_store_id() AND (is_staff() OR scope = 'shared' OR owner_id = current_seller_id())
```

| Tabela          | Dono       | SELECT extra               | Observação                   |
| --------------- | ---------- | -------------------------- | ---------------------------- |
| `quick_replies` | `owner_id` | `scope = 'shared'` visível | privados só do dono (+staff) |
| `asset_combos`  | `owner_id` | —                          | puramente pessoal            |

Escrita (INSERT/UPDATE/DELETE) é sempre só do dono (+staff); o `with check (owner_id = current_seller_id())` impede um vendedor de criar/reatribuir em nome de outro. Os providers já gravam `owner_id = input.ownerId` (vendedor logado), então a escrita não-staff passa sem ajuste.

Validação por impersonação (claims com `app_metadata`):

| Persona                   | quick_replies | asset_combos |
| ------------------------- | ------------- | ------------ |
| Lucas (`seller_internal`) | 8             | 0            |
| Owner                     | 20            | 5            |

Baseline (service role): `quick_replies` 20 (4 shared, 16 private; 8 do Lucas), `asset_combos` 5 (0 do Lucas). Lucas passa a ver só seus 8 (4 shared + 4 privados próprios) e 0 combos — os **12 privados de outros vendedores** e os **5 combos alheios** ficam ocultos. `get_advisors(security)` → nada novo.

**Resolvido no Slice 4:** `customer_segments` / `asset_favorites` / `asset_send_log` (bucket derivado→sellers) — antes store-scoped, agora per-seller.

## RBAC fino — derivadas per-seller (Slice 4, migration `rls_slice4_personal_derived`)

As 3 tabelas com dono pessoal mas **sem `store_id`** (escopadas via o pai `sellers`) mantiveram o store-scope por subquery e **ganharam o recorte per-seller** nos 4 comandos:

```
<dono> in (select id from public.sellers where store_id = current_store_id())
AND (is_staff() OR <dono> = current_seller_id())
```

O **SELECT de `customer_segments`** ainda expõe os `scope = 'shared'` à equipe (igual `quick_replies`):

```
... AND (is_staff() OR scope = 'shared' OR owner_id = current_seller_id())
```

| Tabela              | Dono        | SELECT extra               | Observação            |
| ------------------- | ----------- | -------------------------- | --------------------- |
| `customer_segments` | `owner_id`  | `scope = 'shared'` visível | filtros salvos        |
| `asset_favorites`   | `seller_id` | —                          | pins pessoais         |
| `asset_send_log`    | `seller_id` | —                          | log de envios pessoal |

Escrita só do próprio dono (+staff); os providers gravam `seller_id`/`owner_id` do vendedor que age, então a escrita non-staff passa.

Validação por impersonação (claims com `app_metadata`):

| Persona                   | customer_segments | asset_favorites | asset_send_log |
| ------------------------- | ----------------- | --------------- | -------------- |
| Lucas (`seller_internal`) | 6                 | 0               | 0              |
| Owner                     | 6                 | 0               | 0              |

Baseline: `customer_segments` 6 (5 shared + 1 private, do Lucas); `asset_favorites`/`asset_send_log` vazios no seed. Lucas vê os 5 shared + seu 1 private = 6. **Teste de injeção (tx revertida):** ao inserir um segmento `private` de OUTRO vendedor, Lucas segue vendo 6 (não 7) → recorte cruzado fechado. `get_advisors(security)` → nada novo.

Com isto, o **isolamento per-seller (Slices 1–4)** está completo em todas as tabelas com dono.

## Performance (PRD-108) — índices de FK + initplan da `profiles`

Duas migrations de perf, guiadas pelo `get_advisors(performance)`:

**`perf_index_unindexed_fks`** — 21 índices `idx_<tabela>_<col>` cobrindo todas as FKs sem índice apontadas pelo advisor (inclui `profiles.seller_id`/`store_id`, `stores.manager_id`, `customers.converted_by_seller_id`, `media_assets.linked_*`, `sdr_escalations.*`, etc.). Índices comuns (tabelas pequenas; migration transacional).

**`profiles_select_consolidate_initplan`** — as duas policies permissivas de SELECT (`authenticated`) na `profiles` (`profiles_select_self` + `profiles_select_staff`) viraram **uma só** (`profiles_select_self_or_staff`), com `auth.uid()`/`auth.jwt()` envelopados em `(select …)`:

```sql
using (
  auth_user_id = (select auth.uid())
  or ( coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'role'), '') in ('owner','manager')
       and (((select auth.jwt()) -> 'app_metadata' ->> 'store_id'))::uuid = store_id )
)
```

Semanticamente idêntico (permissivas = OR; `(select …)` só muda a estratégia de avaliação para InitPlan). Lê o JWT direto (sem `is_staff()`/`current_*()`) → sem recursão na `profiles`. A policy de `supabase_auth_admin` (usada pelo hook) fica intacta.

**Resultado do advisor:** `unindexed_foreign_keys` 21→0, `auth_rls_initplan` 2→0, `multiple_permissive_policies` 1→0. Restam só INFO (`unused_index` — os 21 novos ainda sem tráfego — e config de conexões). `get_advisors(security)` inalterado. Impersonação: owner lê os 2 profiles da loja (`listSellerAccessRoles` ok); vendedor lê só o próprio (1).

**Part C (migration `perf_initplan_wrap_helpers`) — FEITO.** Envelopadas em `(select …)` as **151** policies (de 157) que chamam helper — `current_store_id()`/`current_seller_id()`/`current_app_role()`/`is_staff()` viram `(select fn())`, forçando avaliação **InitPlan** (1× por query) em vez de 1× por linha. Reescrita programática via bloco `DO` que tira um snapshot do `pg_policies` numa temp table e dropa/recria cada policy preservando `permissive`/`cmd`/`roles` (o Postgres guarda a função por OID → runtime imune a search_path). Excluídas (sem helper): policies de `profiles` (já com `auth.*` em `(select …)`), `parts_select_anon`, `vehicle_models_select` (`true`) e a do `supabase_auth_admin`.

**Validação:** `still_unwrapped` 151→0; `EXPLAIN` de `select id from orders` (impersonando vendedor) mostra `current_store_id`/`is_staff`/`current_seller_id` como `InitPlan 1/2/3` (uma vez cada); **paridade de impersonação idêntica ao baseline** (owner: orders 477/customers 70/leads 80/quotes 80/conv 96/comm 40/expenses 120/cashflow 5/segments 6/q_replies 20/combos 5/parts 351 · Lucas: 132/18/18/10/28/12/0/0/6/8/0/351). `get_advisors(security)` inalterado.

## Storefront anônimo — leitura pública da loja B2C (migration `storefront_anon_read`)

A loja pública (`/loja/*`, sem login) precisa ler **catálogo** e **config da vitrine** como role `anon`. O risco não é "expor o catálogo" — é vazar **colunas comerciais** (`parts`: custo/margem/fornecedor/estoque) e o **resto das settings** (comissões/financeiro/cnpj, que dividem a coluna `stores.settings` jsonb com a config pública). Como `anon` já tinha grants de tabela completos (default Supabase, gated só pelo RLS), uma simples policy de SELECT vazaria todas as colunas. Solução em duas peças:

**A. Catálogo (`parts`) — grant por coluna + policy `anon`.**

```sql
revoke all on public.parts from anon;                 -- remove o grant cego (todas as colunas + escritas)
grant select (id, sku, name, description, oem_codes, oem_codes_text,
  equivalent_part_ids, cross_references, segment, application_notes, applications,
  brand, category, subcategory, is_original, image_url, unit_price, gtin,
  reference, group_label, part_type, weight_kg, box_quantity, fractionable,
  unit_of_measure, division, active, store_id, created_at, updated_at)
  on public.parts to anon;                            -- só colunas PÚBLICAS
create policy parts_select_anon on public.parts for select to anon using (active = true);
```

**Excluídas (sigilosas):** `unit_cost`, `margin_percent`, `average_cost`, `suppliers`, `supplier`, `supplier_code`, `price_tables`, `fiscal`, `sefaz_status`, `sefaz_checked_at`, `storage_location`, `stock_available`, `stock_minimum`. Anon que tentar lê-las recebe `42501 permission denied`. Escrita anônima negada (grant removido + sem policy de write).

**B. Config da vitrine — função `SECURITY DEFINER` (sem view).**

```sql
create function public.storefront_config(p_store_id uuid) returns jsonb
  language sql stable security definer set search_path = ''
  as $$ select settings -> 'storefront' from public.stores where id = p_store_id $$;
revoke all on function public.storefront_config(uuid) from public;
grant execute on function public.storefront_config(uuid) to anon, authenticated;
```

Retorna **só** `settings->'storefront'` — nunca cnpj/comissões/financeiro. `authenticated` também recebe execute porque **cliente B2C logado não pertence a loja** (`current_store_id()` = null → não lê `stores` pela policy normal). Não há como expor um slice de jsonb a `anon` sem função/view definer.

**Não exposto:** `orders` (ranking "mais vendidos" fica no fallback de ordem-de-catálogo; um `storefront_featured` RPC é follow-up); `vehicle_models` (páginas públicas leem aplicações do jsonb `parts.applications`).

**Validação (impersonação `set local role anon`):** vê 344 ativas / 7 inativas ocultas; lê id/nome/preço/marca/categoria/imagem; `select unit_cost` → `42501`; `insert into parts` → `42501`; `stores`/`orders` → 0 linhas; `storefront_config(HQ)` → jsonb.

**Advisor de segurança:** zero novos **ERRORs**. Surgem 2 **WARN** esperados/aceitos — `anon_security_definer_function_executable` e `authenticated_security_definer_function_executable` — inerentes a qualquer RPC público definer; a função é mínima, read-only e `search_path`-locked, sem vazamento. (`auth_leaked_password_protection` segue WARN pré-existente.)

> ⚠️ **Follow-up de wiring (fora desta migration):** quando a loja for ligada ao Supabase em modo `anon`, o provider de `parts` precisa selecionar **colunas explícitas** (não `select *`, que falha sob grant por coluna), e o de `settings` deve chamar o RPC `storefront_config` em vez de ler `stores` direto.

## Deferido para "corrigir depois"

- **RBAC fino:** pool de não-atribuídos (semântica do pool de conversas sem dono).
- Testes pgTAP + workflow CI (`rls-tests.yml`).
- ~~Storefront anônimo (loja B2C em `supabase` precisa de policies `anon` de catálogo).~~ **FEITO** (migration `storefront_anon_read`) — grant por coluna em `parts` + RPC `storefront_config`. **Pendente de wiring:** ligar os providers da loja ao modo `anon` (colunas explícitas + RPC).
- ~~Performance (PRD-108) — **parcial**~~ **COMPLETO:** FKs indexadas (21 índices), initplan da `profiles`, e Part C (envelopar `current_*()`/`is_staff()` em `(select …)` nas 151 policies — migration `perf_initplan_wrap_helpers`).
- ~~Habilitar o Custom Access Token Hook~~ **FEITO** (Dashboard, 2026-06-08) — claims reais no JWT; helpers já liam claims com fallback.
- ~~Remover o fallback `profiles` das helpers quando o hook estiver universal (perf — PRD-108).~~ **FEITO** (migration `rls_helpers_drop_profiles_fallback`) — helpers leem só o claim do JWT; fail-closed validado por impersonação (com claims = baseline; sem `app_metadata` = 0 linhas).
- Fases 2–5 do PRD-107: login real conectado ao `crmClient`, guarda de rotas por `role`, convite de vendedor (Edge Function), signup B2C/B2B, recuperação de senha.
- Caso de borda: se uma mutação na UI dispara INSERT em `audit_logs` sem `store_id` preenchido pelo provider, a auditoria falha (a operação principal não). Ajustar quando observado.
