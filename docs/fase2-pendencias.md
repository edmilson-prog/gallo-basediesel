# Fase 2 — Pendências & Closeout (Mock → Supabase)

> **Fonte única da verdade** das pendências da Fase 2. Os issues do GitHub são **ponteiros** para as seções deste documento (cada item tem uma âncora `#`). Branch `feat/fase2-supabase-cutover` · PR #39 (draft) · atualizado em 2026-06-09.
>
> Documentos irmãos: roadmap de gap (`docs/prds/ROADMAP-FASE2-BACKEND-GAP-2026-06-09.md`), RLS (`docs/db/rls-policies-fase2-mvp.md`), smoke de cutover (`docs/db/cutover-smoke-checklist.md`).

---

## Onde a Fase 2 está

O **backend do cutover está pronto e validado** (34 providers, 39 tabelas com RLS, isolamento per-seller Slices 1–4, #43 audit/transfers/media, storefront anon, auth real + JWT hook, seed populado). O `/app` foi validado por impersonação + UI, e há **suíte de testes de RLS versionada** (`supabase/tests/rls-regression.sql`, verde).

> 🚀 **GO-LIVE (2026-06-10): produção está em `supabase`** — flip executado e
> smoke completo aprovado pelo dono (ver §A3). A Fase 2 está **fechada**.

A **loja transacional** (checkout + conta B2C) foi **deferida da Fase 2 por decisão registrada** — vira fase própria.

**Resumo:** todos os grupos gated no dono foram concluídos (A1–A4, C1–C3, D2–D4; D1 com PITR ligado e teste de DR pendente). Este documento permanece como registro histórico + backlog do grupo B e §E.

| Grupo | Itens | Natureza |
| --- | --- | --- |
| **A. Fechar o cutover** | ~~A1 CI~~ ✅ · ~~A2 Resend~~ ✅ · ~~A3 Flip prod~~ ✅ · ~~A4 Merge~~ ✅ | **tudo feito** |
| **B. Loja transacional** (deferida) | B1 #40 · B2 #41 · B3 #42 · B4 mídia | fase própria |
| **C. Hardening** (follow-ups) | ~~C1 media write~~ ✅ · ~~C2 addNote~~ ✅ · ~~C3 #44~~ ✅ | **tudo feito** |
| **D. DR & Observabilidade** (PRD-109/110) | D1 PITR+teste DR · D2 secrets backup · D3 Sentry DSN · D4 monitor uptime | código entregue; ativação gated no dono |

---

## A. Fechar o cutover (gated no dono)

### A1 — Ativar a suíte de testes de RLS no CI {#a1-ci}
- **O quê:** ativar o workflow `.github/workflows/rls-tests.yml` que roda `supabase/tests/rls-regression.sql`.
- **Status:** ✅ **FEITO (2026-06-10).** Secret `SUPABASE_DB_URL` configurado e o workflow roda **verde de verdade** a cada PR (validado em execução real — ver §D2 para o hardening no caminho). Issue #45 fechada.
- **Bloqueio / dono:** adicionar o **secret de repositório `SUPABASE_DB_URL`** (string de conexão Postgres para um banco seeded — idealmente um **branch de preview** do Supabase, ou um projeto de teste; o role precisa poder `SET ROLE authenticated|anon`, ex.: `postgres`).
- **Critério de pronto:** PR que toca `supabase/tests/**` dispara o job e ele roda verde de verdade (não no-op).
- **Arquivos:** `supabase/tests/rls-regression.sql`, `.github/workflows/rls-tests.yml`.
- **Issue:** #45

### A2 — Ativar convite por e-mail (Resend) {#a2-resend}
- **Status:** ✅ **FEITO (2026-06-10, validado e2e pelo dono).** Secrets setados (`RESEND_API_KEY`/`RESEND_FROM`/`INVITE_REDIRECT_URL`), domínio verificado, allowlist da redirect URL configurada no Auth. Wiring completo entregue no PR #50 (v0.74.0): rota `/auth/definir-senha` + `inviteSellerByEmail` + botão "Convidar por e-mail" no dialog de Usuários. **Teste de ponta a ponta passou**: convite → e-mail → link → senha definida → login.
- **Follow-ups registrados:** (a) **rotacionar a `RESEND_API_KEY`** (apareceu em print durante a configuração — runbook `docs/infra/rotate-keys.md`); (b) ~~voltar `INVITE_REDIRECT_URL` para a URL de produção no flip~~ ✅ feito no go-live (2026-06-10, via Vault: `https://crm.gallobasediesel.com.br/auth/definir-senha`).
- **Arquivos:** `supabase/functions/invite-seller-email/index.ts`, `src/features/auth/SetPasswordPage.tsx`, `src/features/admin-settings/api/sellerAccess.ts`.
- **Issue:** #46 (fechado).

### A3 — Flip de produção + smoke final {#a3-flip}
- **Status:** ✅ **FEITO — GO-LIVE em 2026-06-10.** Produção
  (crm.gallobasediesel.com.br) roda `supabase` em dados **e** auth (envs da
  Vercel, escopo Production; verificado por inspeção do bundle publicado).
  Itens acoplados executados no mesmo dia: **PITR habilitado** (ver D1) e
  `INVITE_REDIRECT_URL` apontada para a URL de produção via Vault.
- **Smoke final (aprovado pelo dono):** login real, badge "Produção", catálogo
  interno, lista de pedidos completa, mutação de cliente (dormente) com refresh
  imediato, smoke de vendedor e loja anônima — tudo verde.
- **Hotfixes no caminho (mergeados + deployados):** **PR #65** (providers
  supabase clampavam listas em 200 itens → teto 1000 em 17 providers) e
  **PR #66** (detalhe do cliente não refletia mutação — invalidação de queries
  no `ProfileMenu`; espelho de sessão agora carrega `sellerId` para o
  `audit_logs.actor_id` FK → sellers, família #49).
- **Arquivos:** env da Vercel (Production) — ver `docs/db/cutover-smoke-checklist.md` §1/§8.
- **Issue:** #47 (fechada no go-live).

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
- **Status:** ✅ **FEITO** (migration `rls_fase2_48_tighten_media_writes`). O SELECT já era per-seller/staff (#43); agora a **escrita** também: INSERT = `is_staff() OR customer∈carteira OR conversa∈{minhas + pool}` (preserva arquivamento/upload em conversas próprias e do pool); UPDATE/DELETE espelham o SELECT (own conv/cliente ou staff). Fecha o vetor de **injeção** de mídia na galeria de outro vendedor. Após traçar os call sites (`ensureFromMessage`/`upload`/`useMediaActions`) e confirmar que toda mídia tem `conversation_id` e que o vendedor só interage com conversas own+pool, o risco apontado no defer foi descartado.
- **Validação:** impersonação (rollback) — INSERT own/pool ✅, cross-seller ❌; UPDATE/DELETE cross-seller = 0 linhas; owner ✅. Coberto na suíte `supabase/tests/rls-regression.sql`.
- **Arquivos:** policies via migration MCP; `docs/db/rls-policies-fase2-mvp.md` §#48; `supabase/tests/rls-regression.sql`.
- **Issue:** #48 (fechado).

### C2 — Autor de nota: `addNote` usa user id {#c2-addnote}
- **Status:** ✅ **FEITO** (commit `46606d1`). **Decisão: é seller.** A coluna `customer_notes.author_id` é `uuid NOT NULL` com **FK → `sellers(id)`**, e o display resolve o autor via mapa de vendedores; o seed usa `customer.sellerId`. Os 2 call sites passavam `currentUser.id` (auth/profile id, **não** seller) → no Supabase isso viola a FK (23503) e a nota falha; no mock grava id não-resolvível (mostra id cru). Corrigido para `currentUser.sellerId` em `ConversationMenu.tsx` e `NotesTab.tsx`, com guarda (toast) quando o usuário não tem vendedor vinculado. **Provado por impersonação** (rollback): `author_id=seller_id` insere OK; `author_id=auth_uuid` rejeitado pela FK.
- **Arquivos:** `conversations/components/ConversationMenu.tsx`, `customers/components/tabs/NotesTab.tsx`, `conversations/i18n/pt-BR.ts`, `customers/i18n/pt-BR.ts`.
- **Issue:** #49 (fechado).

### C3 — Notificações derivadas no servidor {#c3-notif}
- **Status:** ✅ **FEITO** (migration `notif_44_server_side_derived_reconciler`). As 3 condições derivadas (cliente dormente / vendedor sobrecarregado / conversa sem resposta) agora são recompostas por uma função `public.reconcile_derived_notifications()` (`SECURITY DEFINER`, `search_path` fixo, `EXECUTE` revogado de public/anon/authenticated) agendada por **`pg_cron`** a cada 1 min. Reproduz fielmente o `reconcileDerived` (expira fora de escopo, insere novas, reativa arquivadas). No modo `supabase` o `startReconciler` client-side vira **no-op** (sem escrita dupla); o modo `mock` segue client-side.
- **Validação:** execução (rollback) gerou 14 `cliente.dormente` + 1 `conversa.semResposta` + 2 `vendedor.sobrecarregado`, títulos fiéis ao TS; job `active`; função **não chamável** por `authenticated` (asserção na suíte `supabase/tests/rls-regression.sql`); `get_advisors` sem alerta novo.
- **Dívida consciente (drift):** as 3 condições passam a viver em **2 lugares** — o TS `derivedConditions.ts` (que o dashboard ainda usa para renderizar ao vivo) e a função SQL do job. Mudanças de regra devem tocar os dois. Consolidar numa única fonte (RPC compartilhado) fica para o épico de notificações server-side.
- **Pré-requisito de infra:** exigiu habilitar a extensão **`pg_cron`** (autorizado pelo dono).
- **Arquivos:** migration MCP; `providers/notifications/reconciler.ts`; `supabase/tests/rls-regression.sql`.
- **Issue:** **#44** (fechado).

### C4 — Corrida entre o stamping de `provider_message_id` e o eco do próprio envio {#c4-provider-message-id-race}
- **🔴 Pendente.** Achado em revisão adversarial (2026-07-12) ao implementar o espelhamento de eco de saída da WAHA — **não é específico da WAHA**, o mesmo padrão existe em Meta/Evolution/Evolution-Go/OpenWA.
- **O quê:** todo envio faz `INSERT` da mensagem (sem `provider_message_id`) → chama a API do provedor → só então `.update({status:'sent', provider_message_id})`, **sem checar o erro desse update**. Se o webhook de eco/entrega chegar **entre** essas duas etapas, a dedup por `provider_message_id` (que roda antes de qualquer escrita no webhook) não encontra a linha ainda não carimbada, insere uma segunda linha de mensagem — e o `update` original, ao rodar depois, colide com o índice único `messages_provider_message_id_key` (migration `20260612082548_messages_unique_provider_message_id.sql`) e falha com `23505`, que **não é tratado em nenhum lugar do código** (confirmado por busca — nenhuma referência a `23505` em `supabase/functions`). Resultado: a mensagem original fica presa em `status='queued'` para sempre, e uma duplicata (sem autor, no caso do eco da WAHA) aparece com o conteúdo real.
- **Por quê importa:** mensagem duplicada/travada é visível pro atendente e confunde o histórico da conversa; é uma corrida rara (a resposta da API do provedor normalmente chega bem antes do eco), mas real e sistêmica.
- **Arquivos:** `supabase/functions/_shared/whatsappSendAdapter.ts` (`markMessageSent`), `supabase/functions/_shared/whatsapp/webhook/core.ts` (dedup do eco), `supabase/functions/waha-send/index.ts`, `supabase/functions/waha-webhook/index.ts`.
- **Direção do fix (não implementado):** checar o `update` de `provider_message_id` por erro `23505`; em caso de colisão, é prova de que o webhook já inseriu a linha autoritativa do eco — apagar/suprimir a linha `queued` órfã (ou remapear o id do lado do cliente) em vez de deixar as duas.
- **Issue:** nenhuma aberta ainda.

### C5 — Caminho de entrada do webhook não retorna cedo em falha de INSERT de mensagem {#c5-inbound-message-insert-fallthrough}
- **🔴 Pendente.** Achado na mesma revisão (2026-07-12) — **pré-existente**, não introduzido pela leva de mudanças do dia; contraste notado porque o novo caminho de eco de saída *foi* implementado corretamente.
- **O quê:** em `whatsapp-webhook/index.ts` (linhas ~606-636 na versão revisada) e no equivalente do `waha-webhook/index.ts`, quando o `INSERT` da mensagem de entrada falha (`messageErr`), o código **não retorna** — cai direto no passo de mídia (baixa/sobe mídia pra um `messageId` que nunca existiu, órfã no Storage) e ainda loga sucesso (200) no `integration_logs`. O caminho de eco de saída, implementado hoje, já trata isso certo (retorna cedo em `echoMessageErr`).
- **Por quê importa:** baixa severidade — `messageErr` já é raro (mesmo padrão de insert usado em todo o resto do arquivo); o efeito é mídia órfã no Storage + um log de "sucesso" que não reflete a realidade, dificultando diagnóstico futuro.
- **Arquivos:** `supabase/functions/whatsapp-webhook/index.ts`, `supabase/functions/waha-webhook/index.ts`.
- **Direção do fix (não implementado):** `return json({ ok: true, ignored: "message-insert-failed" }, 200)` logo após o branch de `messageErr`, espelhando o retorno antecipado que o caminho de eco já faz.
- **Issue:** nenhuma aberta ainda.

---

## D. DR & Observabilidade — ativação (PRD-109/110, entregues em 2026-06-10)

> Código, workflows, runbooks, healthcheck e dashboard **entregues** (PRDs 109/110
> `_DONE` com ressalvas, PR #51). O que segue é a ativação, gated no dono.
> **Issue:** #52.

### D1 — Habilitar PITR + executar o 1º teste de DR {#d1-pitr}
- **🟡 PITR HABILITADO (2026-06-10, dia do flip — conforme a decisão de deferir
  até o go-live).** RPO agora ~2 min. **Pendente:** o 1º teste real de
  restauração (runbook `restore-pitr.md`) registrado em
  `docs/infra/dr-test-log.md` com RTO medido — backup não testado é falsa
  segurança (RF-050).
- **O quê:** habilitar o add-on PITR (Dashboard → Database → Backups → Point in Time, ~US$ 100/mês, RPO ~2 min) e executar o primeiro teste real de restauração seguindo `docs/infra/runbooks/restore-pitr.md`.
- **Por quê:** sem PITR o RPO real é 24 h (daily backup). Backup não testado é falsa segurança (RF-050).
- **Critério de pronto:** teste registrado em `docs/infra/dr-test-log.md` com RTO medido. O teste de DR pode ser antecipado com o dump do GitHub (`restore-logical.md`), independente do PITR.

### D2 — Secrets dos workflows de backup {#d2-backup-secrets}
- **✅ FEITO (2026-06-10).** 5 secrets configurados no GitHub Actions e os 3
  workflows validados verdes em execução real (RLS regression roda a cada PR;
  backups todo domingo 06:00 UTC). Hardening no caminho: commits `180de53`
  (gpg `--batch`, alerta Resend best-effort) e `8b6321d` (pin pg17). A senha do
  banco foi **resetada para alfanumérica** — caracteres especiais quebravam o
  parse da URI no psql/pg_dump.
- **O quê:** adicionar no GitHub: `SUPABASE_DB_URL` (mesmo do A1/#45), `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (storage backup). Opcional: `RESEND_API_KEY` + `BACKUP_ALERT_EMAIL` para alerta explícito de falha.
- **Critério de pronto:** `logical-backup.yml` e `storage-backup.yml` rodam verdes com artifact gerado (disparar manualmente a 1ª vez).

### D3 — Conta Sentry + DSN {#d3-sentry}
- **✅ FEITO (2026-06-10).** Projeto Sentry criado; `VITE_SENTRY_DSN` na Vercel
  (Production + Preview, redeploy feito) e `SENTRY_DSN` setado como secret de
  Edge Function via CLI. DSN validado com evento de teste aceito (HTTP 200).
- **O quê:** criar projeto no Sentry (free tier), pôr o DSN em `VITE_SENTRY_DSN` (Vercel) e no secret `SENTRY_DSN` das Edge Functions. Passo a passo: `docs/ops/observability.md` § Sentry.
- **Critério de pronto:** erro de teste aparece no Sentry com tag `traceId`.

### D4 — Monitor de uptime externo {#d4-uptime}
- **✅ FEITO (2026-06-10).** Monitor UptimeRobot ativo no `GET /functions/v1/health`
  (5 em 5 min), confirmado Up. Gotcha resolvido: o UptimeRobot sonda com `HEAD`
  e a função só aceitava `GET` (405 → falso "Down") — `health` v5 aceita `HEAD`
  (mesmos checks, corpo vazio; commit `2499238`).
- **O quê:** cadastrar o endpoint público `GET /functions/v1/health` num monitor (UptimeRobot/BetterStack/cron-job.org, 5 em 5 min) e assinar https://status.supabase.com.
- **Critério de pronto:** alerta de teste recebido (pausar o monitor dispara notificação).

> **Issue #52 FECHADA (2026-06-10):** D2/D3/D4 concluídos; D1 (PITR) deferido
> para o dia do flip (#47) por decisão do dono — ver §D1 e checklist do A3.

---

## E. Onda 6 (DINTEC + NF-e) — encerrada por decisão {#e-dintec}

> **Decisão registrada (2026-06-10):** o DINTEC não disponibiliza export de dados
> (e talvez jamais disponibilize). O **PRD-121** foi entregue como fundação
> agnóstica de fonte (PR #62, v0.84.0 `Anchor` — `src/providers/dintec/`); os
> **PRDs 122–126** (CSV provider + tela de upload, engine `dintec-process`,
> syncs de clientes/peças e reconciliação) estão **DEFERIDOS**. Importações via
> CSV, quando ocorrerem, serão **conduzidas de forma assistida pelo agente
> desenvolvedor** (dry-run + revisão caso a caso, campos do CRM protegidos),
> por ser mais seguro do que manter superfície de upload para um fluxo
> esporádico.
>
> **NF-e própria (PRDs 127–129) — DEFERIDA PARA PÓS-GO-LIVE (decisão de
> 2026-06-10):** a emissão fiscal continua no DINTEC; NF-e própria só se torna
> necessária quando a GALLO decidir substituir o ERP. Pré-requisitos gated no
> dono antes de iniciar: contratar o provedor fiscal (Focus NFe / PlugNotas /
> eNotas — preferir um que **calcule tributos**), certificado digital A1
> (.pfx + senha), IE/regime tributário cadastrados e **NCM real nas peças**
> (hoje o catálogo não tem NCM — sem isso a SEFAZ rejeita). Lacuna conhecida:
> os PRDs **130** (cancelamento + polling) e **131** (config UI + migração),
> referenciados pelos 127–129, não existem em `docs/prds/` — criar ou absorver
> quando a frente for retomada.

## Ordem sugerida para fechar de vez

> ✅ **Fase 2 fechada no go-live de 2026-06-10** — grupos A, C e D concluídos
> (única pendência viva: 1º teste de DR, §D1). O que resta é backlog de fases
> próprias: **B1/B2** (loja transacional), rotação da `RESEND_API_KEY` (§A2) e
> as frentes deferidas da §E.
