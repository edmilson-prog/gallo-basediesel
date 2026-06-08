# RLS — Fase 2 (MVP adaptado) — write policies

> **PRDs relacionados:** PRD-103 (RLS) e PRD-107 (Auth custom claims). Este documento registra a **implementação MVP adaptada** aplicada em 2026-06-08, que diverge do PRD-103 original em dois pontos (schema e fonte de identidade) — ver abaixo. O PRD-107 (Fase 1) iniciou a **transição da identidade para claims do JWT** (com fallback para a subquery) — ver seção "Funções helper de identidade".
> **Aplicação:** migrations versionadas no remoto via MCP (`apply_migration`). Nomes: `rls_helpers_identity`, `rls_policies_store_direct`, `rls_policies_derived_global`, `rls_helpers_security_invoker`, `rls_helpers_jwt_claims_with_fallback`.

## Por que "adaptado"

O PRD-103 foi escrito para schemas `crm` + `storefront` e identidade via **JWT claims** (`auth.jwt() -> 'app_metadata'`), que dependem do **Custom Access Token Hook** (PRD-107). A realidade materializada é:

| PRD-103 assume                    | Realidade                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| schemas `crm` + `storefront`      | schema **`public`**                                                                                           |
| identidade via JWT `app_metadata` | hook **desligado** → identidade resolvida por **subquery em `public.profiles`** (`auth_user_id = auth.uid()`) |

Aplicar o PRD literal **bloquearia tudo** (helpers leem JWT vazio → fail closed). A decisão (Opção A) foi: **profiles-subquery, MVP pragmático** — escopo por loja real, funciona já, e migra para JWT depois sem reescrever policy (basta trocar o corpo das helpers).

## Funções helper de identidade

`SECURITY INVOKER`, `STABLE`, `set search_path = ''`. `EXECUTE` concedido apenas a `authenticated` (revogado de `public`/`anon`).

**Transição PRD-107 (aplicada — migration `rls_helpers_jwt_claims_with_fallback`):** as helpers agora lêem a identidade **primeiro das claims do JWT** (`auth.jwt() -> 'app_metadata'`) e, se ausente, **caem na subquery em `public.profiles`** (permitida por `profiles_select_self`). Esse `coalesce(claim, subquery)` torna o cutover **sem janela de lockout**: token velho / hook ainda não habilitado → fallback idêntico ao comportamento anterior; token com claims → caminho JWT, sem subquery.

```sql
create or replace function public.current_store_id()
returns uuid language sql stable security invoker set search_path = '' as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'store_id', '')::uuid,
    (select store_id from public.profiles where auth_user_id = (select auth.uid()) limit 1)
  );
$$;
-- idem: current_seller_id() (seller_id), current_app_role() (role, sem cast)
create or replace function public.is_staff()
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(public.current_app_role() in ('owner','manager'), false);
$$;
```

> **Estado do hook:** a função `public.custom_access_token_hook(event jsonb)` já existe e está com os grants corretos (`supabase_auth_admin` EXECUTE + SELECT em `profiles` via `profiles_select_auth_admin`; `authenticated`/`anon` sem EXECUTE). Falta apenas **habilitar o hook no Dashboard** (Authentication → Hooks → _Customize Access Token (JWT) Claims_) apontando para `public.custom_access_token_hook`, e relogar para o token novo carregar `app_metadata`. Até lá o fallback mantém tudo funcionando.
>
> **Próximo:** quando o hook estiver universal (todo token carrega claims), remover o fallback `profiles` das helpers (perf — PRD-108) é seguro. As policies nunca mudam.

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

## Deferido para "corrigir depois"

- RBAC fino por vendedor/B2B (hoje owner/manager fazem tudo na loja; vendedor não tem isolamento de carteira ainda).
- Testes pgTAP + workflow CI (`rls-tests.yml`).
- Storefront anônimo (loja B2C em `supabase` precisa de policies `anon` de catálogo).
- Performance das subqueries derivadas (PRD-108 — indexar FKs, otimizar inicialização de RLS).
- **Habilitar o Custom Access Token Hook no Dashboard** (ação do usuário) + relogar — fecha o ciclo do PRD-107 (Fase 1). Helpers já preparados (claims com fallback).
- Remover o fallback `profiles` das helpers quando o hook estiver universal (perf — PRD-108).
- Fases 2–5 do PRD-107: login real conectado ao `crmClient`, guarda de rotas por `role`, convite de vendedor (Edge Function), signup B2C/B2B, recuperação de senha.
- Caso de borda: se uma mutação na UI dispara INSERT em `audit_logs` sem `store_id` preenchido pelo provider, a auditoria falha (a operação principal não). Ajustar quando observado.
