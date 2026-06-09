# Fase 2 — Pendências & Closeout (Mock → Supabase)

> **Fonte única da verdade** das pendências da Fase 2. Os issues do GitHub são **ponteiros** para as seções deste documento (cada item tem uma âncora `#`). Branch `feat/fase2-supabase-cutover` · PR #39 (draft) · atualizado em 2026-06-09.
>
> Documentos irmãos: roadmap de gap (`docs/prds/ROADMAP-FASE2-BACKEND-GAP-2026-06-09.md`), RLS (`docs/db/rls-policies-fase2-mvp.md`), smoke de cutover (`docs/db/cutover-smoke-checklist.md`).

---

## Onde a Fase 2 está

O **backend do cutover está pronto e validado** (34 providers, 39 tabelas com RLS, isolamento per-seller Slices 1–4, #43 audit/transfers/media, storefront anon, auth real + JWT hook, seed populado). O `/app` foi validado por impersonação + UI, e há **suíte de testes de RLS versionada** (`supabase/tests/rls-regression.sql`, verde). O **flip está ativo só no Preview** (produção segue `mock` por decisão).

A **loja transacional** (checkout + conta B2C) foi **deferida da Fase 2 por decisão registrada** — vira fase própria.

**Resumo:** no escopo combinado (`/app`), a parte implementável está concluída. O que resta são **itens gated no dono** (secret de CI, conta Resend, decisão de flip/merge) e **follow-ups de hardening** pequenos.

| Grupo | Itens | Natureza |
| --- | --- | --- |
| **A. Fechar o cutover** | A1 CI · A2 Resend · A3 Flip prod · A4 Merge | gated no dono / decisão |
| **B. Loja transacional** (deferida) | B1 #40 · B2 #41 · B3 #42 · B4 mídia | fase própria |
| **C. Hardening** (follow-ups) | C1 media write · ~~C2 addNote~~ ✅ · C3 #44 | dívida técnica leve |

---

## A. Fechar o cutover (gated no dono)

### A1 — Ativar a suíte de testes de RLS no CI {#a1-ci}
- **O quê:** ativar o workflow `.github/workflows/rls-tests.yml` que roda `supabase/tests/rls-regression.sql`.
- **Status:** testes + workflow **entregues e validados** (commit `a47de19`). O job é **no-op verde** até o secret existir.
- **Bloqueio / dono:** adicionar o **secret de repositório `SUPABASE_DB_URL`** (string de conexão Postgres para um banco seeded — idealmente um **branch de preview** do Supabase, ou um projeto de teste; o role precisa poder `SET ROLE authenticated|anon`, ex.: `postgres`).
- **Critério de pronto:** PR que toca `supabase/tests/**` dispara o job e ele roda verde de verdade (não no-op).
- **Arquivos:** `supabase/tests/rls-regression.sql`, `.github/workflows/rls-tests.yml`.
- **Issue:** #45

### A2 — Ativar convite por e-mail (Resend) {#a2-resend}
- **O quê:** ligar o fluxo de convite de vendedor por e-mail (Edge Function `invite-seller-email`, hoje **inerte**).
- **Status:** scaffold pronto (`supabase/functions/invite-seller-email/index.ts`, v1 ACTIVE, `verify_jwt:true`). Não dispara nada sem a chave.
- **Bloqueio / dono:** criar conta **Resend** + domínio verificado; setar `RESEND_API_KEY`, `RESEND_FROM`, `INVITE_REDIRECT_URL` no projeto. Falta também: wiring client (`inviteSellerByEmail`) + dialog, e a rota `/auth/definir-senha` (destino do link).
- **Critério de pronto:** owner convida um vendedor por e-mail, ele recebe o link, define senha e loga.
- **Arquivos:** `supabase/functions/invite-seller-email/index.ts` (+ wiring client a fazer).
- **Issue:** #46

### A3 — Flip de produção + smoke final {#a3-flip}
- **O quê:** virar o default de **produção** para `supabase` (env na Vercel, escopo Production) e rodar o smoke geral.
- **Status:** **Preview** já roda supabase e passou no smoke de RLS. Produção intacta em `mock`.
- **Bloqueio / dono:** **decisão sua.** ✅ Pré-condição prática **satisfeita**: a loja em `supabase` agora faz **handoff por WhatsApp** (B3, commit `cb7a13d`) em vez do checkout que falhava — visitantes reais não caem mais num fluxo quebrado. O `/app` já estava pronto para o flip.
- **Critério de pronto:** produção em `supabase`, smoke owner+vendedor+loja verde, console limpo.
- **Arquivos:** env da Vercel (Production) — ver `docs/db/cutover-smoke-checklist.md` §1/§8.
- **Issue:** #47

### A4 — Merge do PR #39 {#a4-merge}
- **O quê:** mergear `feat/fase2-supabase-cutover` → `main`.
- **Status:** **bloqueado por regra do dono** ("não mergear até a Fase 2 fechar"). Tecnicamente MERGEABLE/CLEAN, 40+ commits à frente. Default do código é `mock` → merge **não** vira produção (é não-breaking).
- **Bloqueio / dono:** seu "go" explícito. Higiene no merge: descartar `src/routeTree.gen.ts` (ruído gerado), **não** arrastar untracked alheios (PRDs 111–129, `relatorio`, `knip.json`), marcar PR ready.
- **Critério de pronto:** `main` contém a Fase 2; PR fechado.
- **Issue:** N/A (ação de PR, não issue).

---

## B. Loja transacional — DEFERIDA da Fase 2 (fase própria)

> Decisão registrada: a loja pública é **browse-only** no cutover; o funil de compra e a conta logada são uma frente acoplada à **auth de cliente B2C**. Não bloqueia o `/app`.

### B1 — Checkout-backend B2C {#b1-checkout}
- **O quê:** funil de compra anon-safe (criar pedido/cliente/conversa sem escrita anônima) — Edge Function transacional que recalcula preço/estoque no servidor.
- **Bloqueio:** escrita como anon é proibida; precisa Edge Function + (idealmente) auth B2C.
- **Arquivos:** `orders/api/createOrderFromCart.ts`, `ecommerce-integration/api/triggerEcommerceOrder.ts`, `storefront-cart/*`.
- **Issue:** **#40**.

### B2 — Conta do cliente B2C: Supabase Auth + RLS por cliente {#b2-conta}
- **O quê:** trocar `useCustomerAuth` (mock) por Supabase Auth de cliente + RLS escopada por cliente (pedidos/orçamentos/perfil/endereços/veículos).
- **Bloqueio:** não há papel/claim de cliente B2C hoje (o JWT hook cobre staff/sellers).
- **Arquivos:** `storefront-account/hooks/useCustomerAuth.ts`, `useCustomerOrders.ts`, páginas de conta.
- **Issue:** **#41**.

### B3 — Handoff do "Finalizar" + polimento da vitrine {#b3-handoff}
- **O quê:** redesenhar o CTA "Finalizar compra" para **handoff** (deep-link WhatsApp) em vez do checkout demo — para a loja em `supabase` não cair num fluxo que falha. Frontend leve, sem backend de checkout.
- **Status:** **HANDOFF FEITO** (commit `cb7a13d`). `CheckoutPage` faz switch por `getActiveDataSource()`: `mock` mantém o wizard demo de 3 passos intacto; `supabase` renderiza `CheckoutHandoff` — revisão do carrinho + dados opcionais (nome/WhatsApp) + CTA "Enviar pedido pelo WhatsApp" (deep-link write-free) + fallback "Copiar resumo" quando não há número configurado. Texto montado por função pura testada (`buildHandoffMessage`). **Desbloqueia o A3** (flip de produção) com segurança. ~~Criar orçamento~~ descartado do handoff: também é escrita (bloqueada para anon).
- **Polimento da vitrine (opcional, não-bloqueante):** slug humano, imagens reais (acoplado a B4 mídia), multi-loja — não impactam o flip; ficam para quando a loja voltar a ser prioridade.
- **Relevância:** **pré-requisito prático do A3** (flip de produção) — agora satisfeito.
- **Arquivos:** `storefront-cart/pages/CheckoutPage.tsx`, `components/checkout/CheckoutHandoff.tsx`, `utils/handoffMessage.ts(+test)`, `i18n/pt-BR.ts`.
- **Issue:** **#42** (handoff entregue; issue fechável — polimento da vitrine permanece rastreado aqui como opcional).

### B4 — Mídia → Supabase Storage {#b4-midia}
- **O quê:** Storage real para mídia (hoje é metadata-only; exibição usa `parts.imageUrl` externo / placeholder).
- **Bloqueio:** **sem fonte de bytes** — acoplado ao épico de ingestão WhatsApp (PRD-111–120) e/ou UI de upload. Encanamento vazio se feito isolado.
- **Issue:** _(sem issue dedicado — rastreado aqui; abrir quando o épico WhatsApp começar)._

---

## C. Hardening — follow-ups (dívida técnica leve)

### C1 — Apertar a ESCRITA de `media_assets` {#c1-media-write}
- **O quê:** o **SELECT** de `media_assets` já é per-seller/staff (#43). As policies de **escrita** (INSERT/UPDATE/DELETE) seguem store-scoped.
- **Por quê pendente:** a semântica de ingestão de anexo no modo Supabase (cliente vs Edge Function) ainda não está fechada; apertar agora arriscaria quebrar o fluxo de anexos.
- **Critério de pronto:** escrita de mídia alinhada à matriz (vendedor só na própria conversa/cliente; staff na loja), validada por impersonação.
- **Arquivos:** policies de `media_assets` (via migration MCP); `docs/db/rls-policies-fase2-mvp.md` §#43.
- **Issue:** #48

### C2 — Autor de nota: `addNote` usa user id {#c2-addnote}
- **Status:** ✅ **FEITO** (commit `46606d1`). **Decisão: é seller.** A coluna `customer_notes.author_id` é `uuid NOT NULL` com **FK → `sellers(id)`**, e o display resolve o autor via mapa de vendedores; o seed usa `customer.sellerId`. Os 2 call sites passavam `currentUser.id` (auth/profile id, **não** seller) → no Supabase isso viola a FK (23503) e a nota falha; no mock grava id não-resolvível (mostra id cru). Corrigido para `currentUser.sellerId` em `ConversationMenu.tsx` e `NotesTab.tsx`, com guarda (toast) quando o usuário não tem vendedor vinculado. **Provado por impersonação** (rollback): `author_id=seller_id` insere OK; `author_id=auth_uuid` rejeitado pela FK.
- **Arquivos:** `conversations/components/ConversationMenu.tsx`, `customers/components/tabs/NotesTab.tsx`, `conversations/i18n/pt-BR.ts`, `customers/i18n/pt-BR.ts`.
- **Issue:** #49 (fechado).

### C3 — Notificações derivadas no servidor {#c3-notif}
- **O quê:** mover o reconciliador de notificações derivadas para o servidor (cron/Edge Function); hoje roda no cliente, gated por papel staff (fix do 403 desta fase).
- **Status:** funciona client-side gated; mover ao servidor é endurecimento, não bloqueante do cutover.
- **Arquivos:** `providers/notifications/reconciler.ts`.
- **Issue:** **#44**.

---

## Ordem sugerida para fechar de vez

1. **B3 handoff** (se a loja receber tráfego) → desbloqueia o **A3 flip de produção** com segurança.
2. **A1 CI** (adicionar `SUPABASE_DB_URL`) — trava as garantias de RLS em PRs.
3. **A4 merge** quando você considerar a Fase 2 fechada (escopo `/app`).
4. **A2 Resend** e **C1/C2/C3** conforme prioridade.
5. **B1/B2** (loja transacional) — fase própria, quando a loja voltar a ser prioridade.
