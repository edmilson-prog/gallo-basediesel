# RLS — Fase 2 (MVP adaptado) — write policies

> **PRD relacionado:** PRD-103 (RLS). Este documento registra a **implementação MVP adaptada** aplicada em 2026-06-08, que diverge do PRD-103 original em dois pontos (schema e fonte de identidade) — ver abaixo.
> **Aplicação:** migrations versionadas no remoto via MCP (`apply_migration`). Nomes: `rls_helpers_identity`, `rls_policies_store_direct`, `rls_policies_derived_global`, `rls_helpers_security_invoker`.

## Por que "adaptado"

O PRD-103 foi escrito para schemas `crm` + `storefront` e identidade via **JWT claims** (`auth.jwt() -> 'app_metadata'`), que dependem do **Custom Access Token Hook** (PRD-107). A realidade materializada é:

| PRD-103 assume | Realidade |
| --- | --- |
| schemas `crm` + `storefront` | schema **`public`** |
| identidade via JWT `app_metadata` | hook **desligado** → identidade resolvida por **subquery em `public.profiles`** (`auth_user_id = auth.uid()`) |

Aplicar o PRD literal **bloquearia tudo** (helpers leem JWT vazio → fail closed). A decisão (Opção A) foi: **profiles-subquery, MVP pragmático** — escopo por loja real, funciona já, e migra para JWT depois sem reescrever policy (basta trocar o corpo das helpers).

## Funções helper de identidade

`SECURITY INVOKER`, `STABLE`, `set search_path = ''`. Lêem só a própria linha de `profiles` (permitido por `profiles_select_self`). `EXECUTE` concedido apenas a `authenticated` (revogado de `public`/`anon`).

```sql
create or replace function public.current_store_id()
returns uuid language sql stable security invoker set search_path = '' as $$
  select store_id from public.profiles where auth_user_id = (select auth.uid()) limit 1;
$$;
-- idem: current_seller_id() (seller_id), current_app_role() (role)
create or replace function public.is_staff()
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce((select role in ('owner','manager') from public.profiles
                   where auth_user_id = (select auth.uid()) limit 1), false);
$$;
```

> Quando o PRD-107 habilitar os claims no JWT, troca-se **apenas o corpo** destas funções (para ler `auth.jwt() -> 'app_metadata'`). As policies não mudam.

## Escopo por tabela

| Bucket | Tabelas | Regra (SELECT/INSERT/UPDATE/DELETE) |
| --- | --- | --- |
| **Store-direto** (23) | customers, orders, quotes, leads, conversations, parts, commissions, expenses, cash_flow_entries, goals, media_assets, recommendations, carteira_transfers, distribution_traces, product_indicators, quick_replies, scheduled_sends, sdr_escalations, trackable_links, whatsapp_accounts, model_kits, asset_combos, asset_library_items | `store_id = public.current_store_id()` |
| **Derivado via pai** (10) | order_items→orders, quote_items→quotes, messages→conversations, sdr_sessions→conversations, vehicles→customers, customer_notes→customers, model_kit_items→model_kits, customer_segments→sellers, asset_favorites→sellers, asset_send_log→sellers | `<fk> in (select id from <pai> where store_id = public.current_store_id())` |
| **Global** (1) | vehicle_models | SELECT: `authenticated` (todos); escrita: `public.is_staff()` |
| **Especial** (3) | `audit_logs` (imutável: SELECT/INSERT por loja, UPDATE/DELETE `using(false)`) · `sellers` (escrita `is_staff()` + self-update do próprio `auth_user_id`) · `stores` (SELECT/UPDATE só a própria, sem INSERT/DELETE no cliente) | — |

Padrão de nome: `<tabela>_<select|insert|update|delete>`. `anon` **não** tem policy no CRM (fechou o vazamento das policies temporárias `*_select_poc_temp`, que permitiam `anon using(true)`).

## Validação (impersonando o owner)

`begin; select set_config('request.jwt.claims', '{"sub":"<auth_user_id>","role":"authenticated"}', true); set local role authenticated; … rollback;`

- **Leitura:** customers 70, orders 477, order_items 1511, messages 693, vehicles 60, vehicle_models 21 — ✅
- **Escrita same-store:** UPDATE afeta linhas — ✅
- **Isolamento:** usuário sem perfil → `current_store_id()` NULL + 0 linhas em tudo (fail closed) — ✅
- **`get_advisors(security)`:** sem erros; resta só `auth_leaked_password_protection` (config de dashboard, não relacionado).

## Deferido para "corrigir depois"

- RBAC fino por vendedor/B2B (hoje owner/manager fazem tudo na loja; vendedor não tem isolamento de carteira ainda).
- Testes pgTAP + workflow CI (`rls-tests.yml`).
- Storefront anônimo (loja B2C em `supabase` precisa de policies `anon` de catálogo).
- Performance das subqueries derivadas (PRD-108 — indexar FKs, otimizar inicialização de RLS).
- Migração das helpers para claims do JWT quando o PRD-107 habilitar o hook.
- Caso de borda: se uma mutação na UI dispara INSERT em `audit_logs` sem `store_id` preenchido pelo provider, a auditoria falha (a operação principal não). Ajustar quando observado.
