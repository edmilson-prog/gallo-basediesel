# Roadmap — Backend Fase 2 (Mock → Supabase) — Gap Analysis 2026-06-09

> Snapshot do que **realmente falta** para o cutover completo Mock → Supabase, levantado por gap analysis (read-only) na branch `feat/fase2-supabase-cutover` (PR #39, draft). Complementa o `ROADMAP-FASE2-Gallo-Base-Diesel.md` (planejamento original) — este é o **estado de execução** em 2026-06-09.

## TL;DR

O backend está **muito mais completo** do que o `CLAUDE.md` sugere (a descrição de "providers Supabase = stubs que lançam `NotImplementedError`" está **desatualizada**). O cutover é **só env** (`VITE_DATA_SOURCE` + `VITE_AUTH_SOURCE`). Restam ~6 itens, sendo só **1 grande** (Mídia/Storage, e mesmo esse pode ficar simulado).

---

## ✅ O que JÁ está pronto

| Área | Estado |
| --- | --- |
| **Providers** | **33/33 implementados.** Só sobra código defensivo vestigial no `copilot` (tolera um stub de `sdrEscalations` que já não existe; `dismissSuggestion` é no-op session-local — degradação conhecida). Os vários `throw new Error(...)` nos providers são **tratamento de erro**, não stubs. |
| **Schema + RLS** | 39 tabelas, RLS habilitado em todas. |
| **Write policies** | SELECT/INSERT/UPDATE/DELETE completas em todas — **exceto 2 por design**: `profiles` (escrita só via Edge Functions com service_role) e `stores` (sem INSERT/DELETE; confirmado que o app **nunca** cria/apaga loja — `storesProvider.create/delete` não existe; a tela de Lojas só faz UPDATE, que tem policy). |
| **Isolamento per-seller** | Slices 1–4 (carteira, financeiras staff-only, assets pessoais, derivadas) — validado por impersonação. |
| **Performance (PRD-108)** | 21 FK indexes + InitPlan da `profiles` + Part C (helpers envelopados em `(select …)` nas 151 policies). |
| **Helpers de identidade** | Leem só o claim do JWT (fallback `profiles` removido) — fonte única de verdade, fail-closed. |
| **Storefront anon** | Catálogo público por grant-de-coluna + RPC `storefront_config` (sem vazar custo/margem/settings). |
| **Auth** | Real switchável (`VITE_AUTH_SOURCE`); Custom Access Token Hook **universal** (JWT carrega `app_metadata`); Edge Functions de gestão (invite-seller / set-seller-access / reset-seller-password / set-seller-role) + scaffold `invite-seller-email`. |
| **Dados** | Seed populado (impersonação mostra volumes reais: 351 peças, 477 pedidos, 70 clientes, …). |
| **Cutover** | **Só env** — `getDataProviders()` e `AUTH_SOURCE` resolvem em build-time; default `mock`. Sem bloqueio de código. |

---

## 🔨 O que falta (roadmap)

| # | Item | Tamanho | Bloqueio / decisão |
| --- | --- | --- | --- |
| ~~1~~ | ~~**Pool de não-atribuídos**~~ **FEITO** (migration `rls_conversations_pool`, claim model) | — | — |
| 2 | **Mídia → Supabase Storage** — buckets + storage RLS + upload/signed URL reais (hoje `storage_ref` é texto fake `supabase-signed://…`) | **G** | decisão de escopo: mídia real entra na Fase 2? |
| 3 | **Storefront anon wiring** — providers em modo `anon` (provider de `parts` com colunas explícitas em vez de `select *`; provider de settings via RPC `storefront_config`) | **M** | — |
| 4 | **Ativar convite por email** — `RESEND_API_KEY`/`RESEND_FROM`/`INVITE_REDIRECT_URL` + wiring client (`inviteSellerByEmail`) + dialog + rota `/auth/definir-senha` | **P** | conta Resend + domínio (você) |
| 5 | **pgTAP + CI** — testes de RLS versionados (`rls-tests.yml`) | **M** | decisão de secrets/runner do CI |
| 6 | **Flip do cutover + smoke test** — defaults → `supabase` + regressão geral (owner + vendedor logados) | **M** | marco final; depende de 1–5 |

## 🎯 Ordem recomendada

1. ~~**Pool**~~ ✅ **FEITO** (2026-06-09).
2. **Storefront anon wiring** — torna a loja pública real no Supabase; valida o que já foi feito. ← **próximo**
3. **Decisão de Mídia/Storage** — se entra, é o item grande; se fica simulado, sai do roadmap.
4. **Convite por email** — quando o Resend estiver pronto.
5. **pgTAP + CI** — trava as garantias de isolamento.
6. **Flip + smoke** — o grande final.

## ❓ Decisões em aberto

- **Mídia real (Supabase Storage) entra na Fase 2** ou fica simulada (`storage_ref` fake) por enquanto? (Define se o item #2 existe.)
- ~~**Pool:** … reivindicar … ou só staff?~~ **Resolvido** (claim model — não-staff vê+reivindica o pool).

## 📌 Notas

- `CLAUDE.md` precisa de atualização: a seção de Provider Pattern descreve os providers Supabase como stubs — não são mais.
- Detalhe completo de RLS/migrations: `docs/db/rls-policies-fase2-mvp.md`.
- Branch/PR: `feat/fase2-supabase-cutover` / #39 (draft — **não mergear até a Fase 2 fechar**).
