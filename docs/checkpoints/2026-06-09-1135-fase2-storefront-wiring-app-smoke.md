# Checkpoint — Fase 2: storefront anon wiring + prep de cutover + smoke do /app — 2026-06-09T11:35

> **Branch:** `feat/fase2-supabase-cutover` · **Último commit:** `1b7f685` fix(notifications): gate derived reconciler to staff under Supabase
> **Sessão anterior:** Claude Opus 4.8 · **Gerado em:** 2026-06-09 11:35 (-03)
> **PR:** #39 (draft — **NÃO MERGEAR até a Fase 2 fechar**) · 33 commits à frente da `main`

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-06-09-1135-fase2-storefront-wiring-app-smoke.md`
na íntegra e confirme em uma frase que entendeu: 1) o objetivo da sessão,
2) o estado atual do código, 3) qual é a próxima tarefa.
Não faça nenhuma ação até eu autorizar.

PR relacionado: https://github.com/edmilson-prog/gallo-basediesel/pull/39
```

---

## 📌 Contexto do projeto

GALLO BASE DIESEL — SaaS de inteligência comercial (Vite + React 19 + TS strict, TanStack Router/Query, Zustand, Tailwind v4/shadcn, sonner). Provider Pattern (`@/providers/data`, 34 providers) + subsistema de notificações; switch Mock↔Supabase por `VITE_DATA_SOURCE`/`VITE_AUTH_SOURCE` (build-time, default `mock`). Estamos na **Fase 2 (cutover Mock → Supabase)**: schema (40 tabelas) + RLS + auth real já materializados. Project ref Supabase: `njizaasajkdqptlxddqn`. Acesso ao banco via MCP Supabase (`apply_migration`/`execute_sql`/`get_advisors`).

## 🎯 Objetivo da sessão

Continuar o cutover da Fase 2. Foco: (1) **fechar o "storefront anon wiring"** — fazer a loja pública B2C funcionar como `anon` no Supabase; (2) decidir o que fica **fora** da Fase 2 (por análise, não por preguiça); (3) **preparar o flip do cutover** e validar o **backend do `/app`** por impersonação; (4) documentar tudo (docs + **issues do GitHub**, a pedido do usuário). A loja foi **despriorizada** no meio da sessão — foco passou para o `/app`.

## ✅ Progresso (o que foi feito NESTA sessão)

- [x] **Storefront anon wiring — FECHADO.** Commit `4c69771`. `IStorefrontProvider` dedicado (contrato + mock + supabase + factory + hook + barrel); 11 consumidores da loja migrados de `usePartsProvider`/`useSettingsProvider`/`useOrdersProvider` → `useStorefrontProvider`. Migrations (via MCP): `storefront_anon_read_stock` (re-concede `stock_available`/`stock_minimum` ao anon) + `storefront_top_selling_rpc` (RPC SECURITY DEFINER de ranking, sem vazar `orders`). App interno **intocado**.
- [x] **Validação do wiring:** `bun run build` ✅, `tsc` delta limpo ✅, 244 testes ✅; impersonação `anon` (projeção pública 32 colunas OK, `unit_cost` → 42501, RPCs respondem; 344 peças ativas / 186 IDs ranqueados).
- [x] **Decisões de escopo (deferidos por análise):** Checkout-backend B2C → **handoff** (commits `c8d987b`); Mídia/Storage → **deferida** (exploração mostrou sistema metadata-only, contrato sem bytes, sem UI de upload — encanamento vazio; commit `64c890a`).
- [x] **Doc de cutover** `docs/db/cutover-smoke-checklist.md` + fix do `.env.example` (providers não são mais stubs) — commit `590d506`.
- [x] **Doc de status da loja** `docs/storefront-fase2-status.md` (feito vs pendente, por arquivo) — commit `8b2effd`.
- [x] **Varredura de prontidão do `/app`** (impersonação owner vs Lucas) — sem commit (análise). Isolamento per-seller OK; financeiro staff-only bloqueado (expenses/cashflow = 0 p/ Lucas); owner escreve. **3 achados de escopo** (audit_logs/media_assets/carteira_transfers store-wide p/ vendedor) → issue #43.
- [x] **Fix do reconciliador de notificações** — commit `1b7f685`. Gateado a staff sob Supabase (era a causa do `notifications 403` no smoke).
- [x] **Issues do GitHub criadas:** #40, #41, #42, #43, #44 (ver abaixo).
- [x] **Dev server reiniciado** na 5173 (PID 32684 node, bundle novo) a pedido do usuário.

> Checkpoint anterior desta linha: `e38706c` (`docs/checkpoints/2026-06-09-0934-fase2-storefront-anon-perf-pool.md`) cobre `245ac7e..3504bea` (storefront anon read surface, Part C InitPlan, drop fallback, email scaffold, pool, roadmap).

## 🔧 Estado do código

- **Branch:** `feat/fase2-supabase-cutover` (33 commits à frente da `main`), upstream `origin/...` OK.
- **Último commit:** `1b7f685` — fix do reconciliador.
- **Arquivos-chave criados/modificados nesta sessão:**
  - `src/providers/data/contracts/storefront.ts` (A), `impl/mock/storefront.ts` (A), `impl/supabase/storefront.ts` (A), `hooks/useStorefrontProvider.ts` (A); `contracts/index.ts`/`factory.ts`/`index.ts` (M).
  - 11 hooks/components da loja (M) — ver `docs/storefront-fase2-status.md` §2.
  - `src/providers/notifications/reconciler.ts` (M) — gate de staff.
  - Docs (A/M): `docs/storefront-fase2-status.md`, `docs/db/cutover-smoke-checklist.md`, `docs/db/rls-policies-fase2-mvp.md`, `docs/prds/ROADMAP-FASE2-BACKEND-GAP-2026-06-09.md`, `.env.example`.
- **Build/testes:** build ✅ (~17s); testes **244/244** ✅ (houve **1 flake intermitente** num arquivo NÃO-notifications num run; passou em 2 runs seguidos — pré-existente, não introduzido aqui).
- **Working tree:** só ruído — `src/routeTree.gen.ts` (gerado, **não commitar**) + PRDs untracked **não-meus** (111–120 WhatsApp, 124–129 DINTEC/NFe) + `relatorio-codigo-morto-2026-06-04.md` + `knip.json`.
- **Migrations:** vivem **só no remoto** (aplicadas via MCP) — não há `supabase/migrations/` no repo (gap rastreado).

## ⏳ Pendências (próximos passos, em ordem)

1. **Destravar o login do Lucas (usuário).** Smoke do `/app` parou em "Acesso negado". Causa: `POST /auth/v1/token?grant_type=password → 400` = **senha incorreta** do Lucas (`lucas@gallobasediesel.com.br`). **Ação do usuário:** logado como owner, redefinir a senha em *Configurações → Usuários* (Edge Function `reset-seller-password`). Critério de feito: login do Lucas sem 400; sem `notifications 403`; ver carteira escopada. ⚠️ **Se logar OK mas ainda "Acesso negado"** → é RBAC de rota; pedir a URL + console e investigar o guard/mapeamento de papel.
2. **Decidir escopo dos 3 achados (issue #43):** `audit_logs`/`media_assets`/`carteira_transfers` store-wide p/ vendedor não-staff — proposital ou gap? Se gap, tightenar RLS e validar por impersonação (paridade owner+vendedor) + telas de staff. Arquivos: migrations via MCP; doc `docs/db/rls-policies-fase2-mvp.md`.
3. **Flip do cutover + smoke completo:** seguir `docs/db/cutover-smoke-checklist.md` (owner + vendedor + loja anon). Mudar o **default** para `supabase` é o marco final — **só com aprovação**.
4. **pgTAP + CI (#travado):** precisa migrations-as-code (hoje só no remoto; `supabase db pull` exige CLI + senha do DB) + runner/secrets de CI.
5. **Convite por email (#travado):** setar `RESEND_API_KEY`/`RESEND_FROM`/`INVITE_REDIRECT_URL` (conta Resend do usuário) + wiring client + rota `/auth/definir-senha`.

## ❓ Decisões pendentes

- **Escopo de `audit_logs`/`media_assets`/`carteira_transfers` p/ vendedor (issue #43).** Opção A: tightenar (escopar por self/conversa/cliente) — mais seguro, risco de quebrar telas de staff. Opção B: manter store-wide (transparência) — aceitar. Inclinação: provável tighten de `media_assets` (vaza metadado de sensíveis) e `audit_logs`; `carteira_transfers` baixo. **Quem decide:** usuário.
- **Checkout B2C: handoff vs Edge Function transacional (issue #40).** Decidido handoff p/ cutover; Edge Function fica p/ quando a loja for prioridade.

## 🚧 Bloqueios / Riscos

- **Login do Lucas (400)** bloqueia o smoke de vendedor na UI — depende do usuário redefinir a senha.
- **pgTAP/CI** e **email** travados em infra/conta do usuário (DB password / CI secrets / Resend).
- **Migrations só no remoto** — risco de reprodutibilidade (não dá pra reconstruir o DB do zero pelo repo).
- **Flake de teste intermitente** (1 arquivo não-notifications) — pré-existente; ver issue #33 (noUnusedLocals) e #1 (tsc fora do build) para contexto de qualidade.

## ⚠️ Avisos do usuário (regras desta sessão)

- **PR #39 fica DRAFT — NUNCA mergear até a Fase 2 fechar.**
- **`service_role` NUNCA no cliente** — só em `.env.local` (sem prefixo `VITE_`, gitignored); não ler o valor. Edge Functions pegam do env do servidor.
- **Criar usuário/definir senha é só pelo fluxo da plataforma** (Edge Functions que o owner dispara) — o agente NÃO cria auth.users com credenciais inventadas (classifier-bloqueado).
- **Abrir write policy para `anon` é PROIBIDO.**
- **Ignorar `.claude/worktrees/` completamente.**
- **Usuário testa a UI manualmente** (cola erros de console) — NÃO abrir browser/preview.
- **`routeTree.gen.ts` é ruído gerado** — nunca commitar; suja o working tree.
- **Avisos de CRLF no `git add` são falsos-positivos** — ignorar.
- **bunfig impõe guarda de 24h de supply-chain** — confirmar antes de adicionar a `minimumReleaseAgeExcludes`.
- **Protocolo AILA** (explore→plan→`confirma`) antes de implementar; **responder sempre em pt-BR com acentuação correta**.
- **Foco atual: `/app`** (loja despriorizada, mas documentada).
- Trailer de commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## 🛡️ Não regredir

- **Modo `mock` (default) intacto** — toda a fiação nova delega ao mock; comportamento idêntico no default que está no ar.
- **Catálogo interno do `/app`** (staff vê custo/margem/estoque) — providers `parts`/`settings`/`orders` NÃO foram tocados.
- **Isolamento per-seller** (carteira), **financeiro staff-only**, **pool de conversas** — validados por impersonação; não quebrar.
- **Reconciliador para staff** (owner/manager) deve continuar gerando alertas (em mock e em supabase-staff).

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `docs/prds/ROADMAP-FASE2-BACKEND-GAP-2026-06-09.md` — estado de execução do backend Fase 2 (TL;DR atualizado).
- `docs/storefront-fase2-status.md` — tudo da loja (feito vs pendente, por arquivo).
- `docs/db/cutover-smoke-checklist.md` — como ligar supabase local + matriz de smoke + credenciais.
- `docs/db/rls-policies-fase2-mvp.md` — RLS/migrations (a "bíblia").
- `src/providers/notifications/reconciler.ts` — fix do gate de staff.
- `src/providers/data/impl/supabase/storefront.ts` — provider público (PUBLIC_COLUMNS + RPCs).
- `CLAUDE.md` — convenções do projeto.

## 🧪 Dados de teste / impersonação (verificáveis)

- **Owner:** `admin@ailainteligente.com` · role `owner` · seller_id `57706ecc-01b5-4a96-b403-0359a4bb767f` · auth_user_id `9a418578-2671-4141-a15a-d39b2fd13af7`.
- **Vendedor:** `lucas@gallobasediesel.com.br` · role `seller_external` · seller_id `5a6400ed-5aec-4bf1-b641-31635f15c887` · auth_user_id `154c3c64-15c0-41ec-824c-9fbfc3cc9ac4`.
- **store_id (HQ, single-store):** `00000000-0000-0000-0000-000000000001`.
- Padrão de impersonação: `begin; select set_config('request.jwt.claims', '{"sub":"<auth_user_id>","role":"authenticated","app_metadata":{"role":"<role>","store_id":"...","seller_id":"..."}}', true); set local role authenticated; <queries>; rollback;`
- Volumes (owner): customers 70, leads 80, orders 477, quotes 80, conversations 96, messages 693, parts 351. Lucas: 18/18/132/10/42/326, expenses 0, cashflow 0.

## 🐙 Issues do GitHub criadas nesta sessão

- **#40** [Loja] Checkout-backend B2C (anon-safe) — handoff vs Edge Function.
- **#41** [Loja] Conta do cliente B2C: Supabase Auth + RLS por cliente.
- **#42** [Loja] Handoff "Finalizar" + backlog (slug/imagens/multi-loja).
- **#43** [RLS] Revisar escopo p/ vendedor: audit_logs/media_assets/carteira_transfers (achado da varredura).
- **#44** [Notificações] Gerar notificações derivadas no servidor (cron/Edge Function).

## 🧠 Memórias relacionadas

- `project_fase2_supabase_kickoff.md` — kickoff da Fase 2 (convenções snake_case+mapper+jsonb+uuid; auth real; RLS slices).
- `project_routetree_merge_block.md` — `routeTree.gen.ts` gerado suja o working tree.
- `project_devserver_stale_branch.md` — dev server zumbi; portas (gallo=5173).
- `feedback_manual_testing.md` — usuário testa UI manualmente.
- `project_tsc_baseline_errors.md` — baseline de ~315 erros tsc; gate real é `bun run build`.

## 📚 Referências

- PR: https://github.com/edmilson-prog/gallo-basediesel/pull/39
- Commits desta sessão: `4c69771`, `c8d987b`, `64c890a`, `590d506`, `8b2effd`, `1b7f685`.
- Estado imediato: usuário reiniciou o dev server (5173, supabase mode via `.env.local`), tentando logar como Lucas → "Acesso negado" (causa provável: senha). Aguardando console pós hard-reload.
