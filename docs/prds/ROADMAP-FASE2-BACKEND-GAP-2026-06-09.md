# Roadmap — Backend Fase 2 (Mock → Supabase) — Gap Analysis 2026-06-09

> Snapshot do que **realmente falta** para o cutover completo Mock → Supabase, levantado por gap analysis (read-only) na branch `feat/fase2-supabase-cutover` (PR #39, draft). Complementa o `ROADMAP-FASE2-Gallo-Base-Diesel.md` (planejamento original) — este é o **estado de execução** em 2026-06-09.

## TL;DR

O backend está **muito mais completo** do que o `CLAUDE.md` sugere (a descrição de "providers Supabase = stubs que lançam `NotImplementedError`" está **desatualizada**). O cutover é **só env** (`VITE_DATA_SOURCE` + `VITE_AUTH_SOURCE`).

**Estado em 2026-06-09:** o backend de cutover está **essencialmente pronto**. Pool ✅, Storefront anon ✅, #43 RLS audit/transfers/media ✅, testes de RLS versionados + CI ✅. Os dois itens "grandes" foram **deferidos por análise** (não por preguiça): **Mídia/Storage** (encanamento vazio — sem fonte de bytes; acoplado a WhatsApp/upload-UI) e **Checkout B2C** (escreve como anon — vira handoff). **Restam apenas itens gated no dono:** **convite por email** (bloqueado no Resend) e o **flip do cutover de produção** (decisão — Preview já validado; ativar o CI exige o secret `SUPABASE_DB_URL`).

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
| ~~2~~ | ~~**Mídia → Supabase Storage**~~ **DEFERIDO (fora da Fase 2)** — exploração (2026-06-09) mostrou: sem buckets, sistema é **metadata-only**, o contrato `IMediaUploadInput` **não carrega bytes**, não há UI de upload e a exibição é placeholder. Storage real seria encanamento vazio. **Acoplado** à frente que traz a fonte de bytes (ingestão WhatsApp PRD-111–120 / upload-UI). Storefront usa `parts.imageUrl` externo, não Storage. | **G** | resolvido: não entra na Fase 2 |
| ~~3~~ | ~~**Storefront anon wiring**~~ **FEITO** (commit `4c69771`) — `IStorefrontProvider` dedicado (colunas públicas + RPCs `storefront_config`/`storefront_top_selling`) + 11 consumidores migrados + migration `storefront_anon_read_stock`. App interno intocado. | **M** | — |
| ~~3.5~~ | ~~**Checkout-backend B2C**~~ **DEFERIDO (fora da Fase 2)** — o funil de compra (`createOrderFromCart` + `triggerEcommerceOrder`) escreve `orders`/`customers`/`conversations` como anon (proibido). Decisão: loja pública é **browse-only**; "Finalizar" vira **handoff p/ vendedor** (WhatsApp/orçamento). Hoje é um demo rotulado. | — | resolvido: não entra na Fase 2 |
| 4 | **Ativar convite por email** — `RESEND_API_KEY`/`RESEND_FROM`/`INVITE_REDIRECT_URL` + wiring client (`inviteSellerByEmail`) + dialog + rota `/auth/definir-senha` | **P** | conta Resend + domínio (você) |
| ~~5~~ | ~~**pgTAP + CI**~~ **FEITO** — harness de RLS em **SQL puro** (`supabase/tests/rls-regression.sql`, sem dependência de extensão; validado por impersonação: owner/seller/anon/fail-closed + #43 + sem cross-leak) + workflow `.github/workflows/rls-tests.yml`. Optou-se por SQL puro porque instalar pgTAP no banco compartilhado exige consentimento explícito (mudança persistente de infra). | **M** | só falta o secret `SUPABASE_DB_URL` p/ ativar o CI (no-op verde até lá) |
| 6 | **Flip do cutover + smoke test** — defaults → `supabase` + regressão geral (owner + vendedor logados) | **M** | marco final; depende de 1–5 |

## 🎯 Ordem recomendada

1. ~~**Pool**~~ ✅ **FEITO** (2026-06-09).
2. ~~**Storefront anon wiring**~~ ✅ **FEITO** (2026-06-09, commit `4c69771`).
3. ~~**Decisão de Mídia/Storage**~~ ✅ **DEFERIDO** (2026-06-09) — acoplado à frente WhatsApp/upload-UI.
4. **Convite por email** — quando o Resend estiver pronto (bloqueado em você).
5. ~~**pgTAP + CI**~~ ✅ **FEITO** (2026-06-09) — harness SQL validado + workflow; falta só o secret `SUPABASE_DB_URL` para ativar o CI.
6. **Flip + smoke** — Preview ✅ (env escopado + smoke de RLS verde). Flip de **produção** é decisão do dono (loja transacional ainda deferida).

> **Hardening de cutover (frontend, esta sessão):** varredura do bug "id de usuário usado como id de vendedor" — corrigido no inbox (filtro/claim), Comissões (menu + nº do pedido), e em segmentos/snippets/quick-send/copiloto/escalação SDR. Tudo em `mock` **e** `supabase`. Sem isso, vendedores veriam "0 resultados" ou escritas falhariam no RLS.

> **Pré-cutover (UX, leve, não-backend):** redesenhar o "Finalizar compra" da loja para handoff (WhatsApp/orçamento) em vez do checkout demo — para o modo `supabase` não cair num fluxo que falha. Não bloqueia os itens de backend.

## ❓ Decisões em aberto

- ~~**Mídia real (Supabase Storage) entra na Fase 2?**~~ **Resolvido** (deferida — encanamento vazio sem fonte de bytes; acoplada a WhatsApp/upload-UI).
- ~~**Pool:** … reivindicar … ou só staff?~~ **Resolvido** (claim model — não-staff vê+reivindica o pool).
- ~~**Checkout B2C:** pedido online vs handoff?~~ **Resolvido** (handoff — checkout-backend fora da Fase 2; "Finalizar" → WhatsApp/orçamento como tarefa de UX pré-cutover).

## 📌 Notas

- `CLAUDE.md` precisa de atualização: a seção de Provider Pattern descreve os providers Supabase como stubs — não são mais.
- Detalhe completo de RLS/migrations: `docs/db/rls-policies-fase2-mvp.md`.
- Branch/PR: `feat/fase2-supabase-cutover` / #39 (draft — **não mergear até a Fase 2 fechar**).
