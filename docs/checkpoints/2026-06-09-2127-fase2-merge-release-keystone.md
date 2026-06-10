# Checkpoint — Fase 2: hardening final, MERGE do PR #39 e release v0.73.0 Keystone — 2026-06-09T21:27

> **Branch:** `main` · **Último commit:** `a7ab5d4` chore(release): v0.73.0 Keystone — Fase 2 cloud cutover complete
> **Sessão anterior:** Claude Opus 4.8 · **Gerado em:** 2026-06-09 21:27 (-0300)

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-06-09-2127-fase2-merge-release-keystone.md` na íntegra
e confirme em uma frase que entendeu: 1) o objetivo da sessão, 2) o estado atual do código,
3) qual é a próxima tarefa. Não faça nenhuma ação até eu autorizar.

Doc mestre de pendências: docs/fase2-pendencias.md · PR #39: MERGED · Tag: v0.73.0
```

---

## 📌 Contexto do projeto

**GALLO BASE DIESEL** — SaaS de inteligência comercial (distribuidora de peças pesadas), Vite + React 19 + TS strict, TanStack Router/Query, Zustand, Tailwind v4/shadcn. **Provider Pattern** (`@/providers/data`, 34 providers) com switch Mock↔Supabase por env (`VITE_DATA_SOURCE`/`VITE_AUTH_SOURCE`, build-time, **default `mock`**). Supabase project ref `njizaasajkdqptlxddqn`; migrations **só via MCP `apply_migration`** (sem arquivos locais em `supabase/migrations/`). **MARCO DESTA SESSÃO: a Fase 2 (cutover Mock→Supabase, escopo A = `/app`) foi MERGEADA na `main`** (PR #39, merge commit `4af08b8`) e **versionada como `v0.73.0 Keystone`** (tag pushada). A loja transacional (checkout/conta B2C) foi deferida para fase própria por decisão registrada.

## 🎯 Objetivo da sessão

Concluir a meta `/goal "conclua a fase 2"`: fechar os últimos itens de hardening que eu conseguia executar sozinho (#42 handoff da loja, #49 autor de nota, #48 escrita de mídia, #44 notificações server-side), e então — com o "confirma merge" explícito do usuário, que **suspendeu a regra de não-merge** e declarou a **Fase 2 fechada no escopo A** — mergear o PR #39 na `main` e rodar o `/versionamento` (release v0.73.0).

## ✅ Progresso (o que foi feito)

- [x] **#42 — Handoff da loja**, commit `cb7a13d` — `CheckoutPage` faz switch por `getActiveDataSource()`: `mock` → wizard demo de 3 passos intacto; `supabase` → `CheckoutHandoff` novo (revisão do carrinho + nome/WhatsApp opcionais + CTA deep-link `wa.me` **write-free** + fallback "Copiar resumo" com telefone/e-mail da loja). Texto por função pura `buildHandoffMessage` (+6 testes Vitest). Issue #42 fechado. Docs `e8cc202`.
- [x] **#49 — Autor de nota = seller**, commit `46606d1` — `customer_notes.author_id` é FK NOT NULL → `sellers(id)`; os 2 call sites (`ConversationMenu.tsx`, `NotesTab.tsx`) passavam `currentUser.id` (auth uuid) → FK 23503 no supabase / id cru na UI em mock. Corrigido para `currentUser.sellerId` com guarda+toast (`noteAuthorMissing`/`noSellerError`). Provado por impersonação (rollback). Issue #49 fechado. Docs `ee6d4a4`.
- [x] **#48 — Escrita de `media_assets` per-seller**, migration MCP `rls_fase2_48_tighten_media_writes` + commit `803ab9d` — INSERT = `is_staff() OR customer∈carteira OR conversa∈{minhas+pool}` (preserva `ensureFromMessage`/upload quick-send); UPDATE/DELETE espelham o SELECT #43. Fecha o vetor de injeção de mídia na galeria de outro vendedor. Provado por impersonação; caso adicionado à suíte `supabase/tests/rls-regression.sql`; advisors limpos. Issue #48 fechado.
- [x] **#44 — Notificações derivadas server-side**, migration MCP `notif_44_server_side_derived_reconciler` + commit `9785855` — **`pg_cron` HABILITADO (extensão nova, autorizada explicitamente pelo usuário — "Path 1")**; função `public.reconcile_derived_notifications()` (`SECURITY DEFINER`, `search_path` fixo, **EXECUTE revogado** de public/anon/authenticated) agendada a cada 1 min (job `reconcile-derived-notifications`, jobid 1). Reproduz fielmente o `reconcileDerived` (expira/insere/reativa). `startReconciler` client-side virou **no-op em supabase** (sem escrita dupla); mock segue client-side. Validado (rollback): 14 `cliente.dormente` + 1 `conversa.semResposta` + 2 `vendedor.sobrecarregado`, títulos fiéis ao TS; asserção #44 adicionada à suíte de RLS. Issue #44 fechado.
- [x] **MERGE do PR #39** — usuário deu o "confirma merge" (defaults: merge commit no-ff, sem squash). Higiene executada: `git restore src/routeTree.gen.ts`, `gh pr ready 39`, `gh pr merge 39 --merge --delete-branch`. **Merge commit `4af08b8`** (2026-06-10T00:00Z), branch `feat/fase2-supabase-cutover` deletada (remota+local), local sincronizado.
- [x] **Release `v0.73.0 Keystone`**, commit `a7ab5d4` + **tag anotada `v0.73.0` pushada** — via skill `/versionamento`: `package.json` 0.72.0→0.73.0; `CHANGELOG.md` nova seção `[0.73.0] — Keystone · 2026-06-10` (Added + Security, linguagem leiga); `CLAUDE.md` 3 refs atualizadas. Build verde (copy-changelog → `public/`). Codinome: Keystone (a pedra que fecha a estrutura, após Bedrock).
- [x] **Memória do projeto atualizada** (`project_fase2_supabase_kickoff.md` + `MEMORY.md`) com o marco do merge, pg_cron habilitado e itens restantes.
- [x] Doc mestre `docs/fase2-pendencias.md` atualizado a cada item — **Grupo C (hardening) 100% concluído**.

## 🔧 Estado do código

- **Branch:** `main` — sincronizada com `origin/main`. A branch da Fase 2 não existe mais.
- **Último commit:** `a7ab5d4` — `chore(release): v0.73.0 Keystone — Fase 2 cloud cutover complete`.
- **Working tree:** **nada meu** — só `src/routeTree.gen.ts` (gerado, ignorar/descartar) + untracked **alheios** (INDEX-PRDs-fase2-v1_4, PRDs 111–129, `relatorio-codigo-morto-2026-06-04.md`, `knip.json`). **Não commitar nada disso.**
- **Migrations Supabase aplicadas nesta sessão (via MCP):** `rls_fase2_48_tighten_media_writes` · `notif_44_server_side_derived_reconciler` (inclui `create extension pg_cron` + `cron.schedule`).
- **Build/testes:** `bun run build` ✅ · `bun run test` **250/250** ✅ (244 + 6 novos do handoff) · ESLint limpo nos arquivos tocados · `tsc` delta limpo (baseline pré-existente permanece).
- **PRs:** #39 **MERGED**. Aberto restante: #9 (página "em breve" — alheio a esta linha de trabalho).
- **Issues fechados nesta sessão:** #42, #44, #48, #49.

## ⏳ Pendências (próximos passos, em ordem) — fonte: `docs/fase2-pendencias.md`

**Tudo que resta é gated no dono** (nenhuma tarefa executável por mim sem ação/decisão dele):

1. **#45 — Ativar CI de RLS** — adicionar secret de repositório `SUPabase_DB_URL` → **`SUPABASE_DB_URL`** (connection string Postgres de banco seeded; role com `SET ROLE authenticated|anon`). **Critério:** workflow `.github/workflows/rls-tests.yml` roda verde de verdade (não no-op) num PR que toque `supabase/tests/**`.
2. **#46 — Convite por e-mail (Resend)** — criar conta Resend + domínio verificado; setar `RESEND_API_KEY`/`RESEND_FROM`/`INVITE_REDIRECT_URL`; depois falta wiring client (`inviteSellerByEmail` + dialog) e rota `/auth/definir-senha`. **Critério:** owner convida vendedor por e-mail e ele define senha e loga.
3. **#47 — Flip de produção** — mudar env da Vercel (escopo Production) para `supabase` + smoke geral (owner + vendedor + loja). Pré-condição prática (handoff #42) **já satisfeita**. **Critério:** produção em supabase, console limpo.
4. *(Opcional, cosmético)* Atualizar o **parágrafo de estado do `CLAUDE.md`** (linha ~9): ainda diz "Fase 1… falta migração de dados e write policies (PRD-103)" — desatualizado pós-merge. Atualizei só as refs de versão para manter o bump cirúrgico; ofereci a reescrita e o usuário ainda não respondeu.
5. *(Fase própria, deferida)* Loja transacional: #40 (checkout-backend B2C) / #41 (conta B2C + RLS por cliente) / B4 (mídia → Supabase Storage, acoplada ao épico WhatsApp PRDs 111–120).

## ❓ Decisões pendentes

- **Reescrever o parágrafo de estado do `CLAUDE.md`?** — Oferecido ao final da sessão; sem resposta. Inclinação: sim, numa próxima sessão (é doc-only).
- **Quando flipar produção (#47)** — decisão de negócio do dono; tecnicamente pronto.
- *(Nenhuma decisão técnica em aberto — as da sessão foram tomadas: Path 1 para #44 com pg_cron autorizado; merge no-ff sem squash; escopo A como definição de "Fase 2 fechada".)*

## 🚧 Bloqueios / Riscos

- **#45/#46/#47 dependem de infra/decisão do dono** — secret de CI, conta Resend, flip da Vercel.
- **⚠️ Drift consciente (#44):** as 3 condições derivadas (cliente A dormente / vendedor sobrecarregado / conversa sem resposta) agora vivem em **2 lugares** — TS `src/providers/notifications/conditions/derivedConditions.ts` (dashboard ao vivo) **e** a função SQL `public.reconcile_derived_notifications()`. **Mudanças de regra devem tocar os dois.** Registrado em `docs/fase2-pendencias.md` §C3.
- **Job pg_cron roda a cada 1 min em produção do banco** — custo desprezível (set-based), mas se algum dia incomodar, ajustar com `cron.alter_job`/`cron.unschedule`.
- O PR #9 (página "em breve") segue aberto e **não é desta linha de trabalho** — não mexer sem pedido.

## ⚠️ Avisos do usuário (regras desta sessão — CRÍTICO)

- **A regra "PR #39 nunca mergeia" foi SUSPENSA pelo próprio usuário** nesta sessão ("confirma merge") — Fase 2 declarada fechada no **escopo A**. Não há mais branch de cutover.
- **`service_role` NUNCA no cliente** (só `.env.local`, sem prefixo `VITE_`, gitignored — não ler o valor).
- **Extensões/infra compartilhada só com consentimento explícito** — `pg_cron` foi **autorizado** ("Path 1") e está instalado; **pgTAP segue NÃO autorizado** (classifier bloqueou; não reinstalar sem pedir).
- **Abrir policy de WRITE para `anon` é PROIBIDO.**
- **Usuário testa a UI manualmente** (cola erros de console) — **não abrir browser/preview**.
- **`src/routeTree.gen.ts`** é gerado (ruído) — nunca commitar; descartar antes de merges.
- **Untracked alheios** (INDEX/PRDs 111–129, relatorio, knip.json) **não são meus — não commitar**.
- **Ignorar `.claude/worktrees/`** por completo. Avisos CRLF do git são **falso-positivo**.
- **Responder sempre em pt-BR** com acentuação correta. **Commits:** Conventional Commits em inglês, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Protocolo AILA: explorar → planejar → **aguardar "confirma"** antes de implementar mudanças substantivas.
- Senha/convite de vendedor: via Edge Functions disparadas pelo owner (não inventar credenciais).

## 🛡️ Não regredir (deve continuar funcionando)

- **Default `mock` intacto** — merge ≠ go-live; produção segue mock até o flip (#47). Preview da Vercel roda supabase.
- **Isolamento per-seller (RLS Slices 1–4 + #43 + #48)** — vendedor vê/escreve só a própria carteira; staff vê a loja. Suíte `supabase/tests/rls-regression.sql` cobre owner/lucas/anon/fail-closed + escrita de mídia + #44.
- **Checkout da loja** — `mock`: wizard demo de 3 passos completo; `supabase`: handoff WhatsApp (sem escrita anon).
- **Notas de cliente** — autor é o **seller** (`currentUser.sellerId`); usuário sem vendedor vinculado recebe toast claro.
- **Notificações derivadas** — geradas pelo **servidor** (job pg_cron a cada 1 min) no modo supabase; client-side reconciler só em mock. Função NÃO chamável por authenticated.
- **Inbox** (filtro "Atribuídas a mim" + pool + reivindicar via `seller_id`), **Comissões** (menu p/ vendedor + nº do pedido), **storefront anon** (catálogo sem custo/margem), **auth real** (login owner+vendedor).
- **Versão na UI** — rodapé/Sobre leem a última entrada do `CHANGELOG.md` (copiado p/ `public/` pelos pre-scripts) → mostra v0.73.0 Keystone.

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `docs/fase2-pendencias.md` — **fonte da verdade** das pendências (A1/A2/A3 abertos; B deferido; C todo ✅). Issues #45–#47 apontam aqui.
- `docs/db/rls-policies-fase2-mvp.md` — todas as policies/migrations RLS (incl. §#43 e §#48).
- `supabase/tests/rls-regression.sql` + `.github/workflows/rls-tests.yml` — suíte de RLS versionada + CI (no-op até o secret #45).
- `src/providers/notifications/reconciler.ts` — no-op em supabase (server-side via pg_cron); `conditions/derivedConditions.ts` — par TS do SQL (drift!).
- `src/features/storefront-cart/{pages/CheckoutPage.tsx,components/checkout/CheckoutHandoff.tsx,utils/handoffMessage.ts}` — handoff #42.
- `CHANGELOG.md` (topo: 0.73.0 Keystone) e `CLAUDE.md` (⚠️ parágrafo de estado linha ~9 desatualizado — pendência 4).
- `docs/checkpoints/2026-06-09-1544-fase2-cutover-hardening-pendencias.md` — checkpoint anterior (estado pré-merge).

## 🧠 Memórias relacionadas

- `project_fase2_supabase_kickoff` — **atualizada nesta sessão** com o marco do merge (escopo A na main, pg_cron habilitado, gated #45/#46/#47).
- `project_routetree_merge_block` — routeTree.gen.ts é ruído gerado; descartar antes de merges.
- `project_tsc_baseline_errors` — tsc tem baseline; avaliar por delta; gate real é build+test.
- `feedback_manual_testing` — usuário testa UI manualmente; não abrir browser/preview.
- `project_git_autocrlf_subagents` — CRLF é falso-positivo; subagentes não trocam de branch.

## 📊 Atividade recente (telemetria)

Sem `.claude-metrics/annotations.jsonl` no projeto (telemetria não ativa).

## 📚 Referências

- PR mergeado: https://github.com/edmilson-prog/gallo-basediesel/pull/39 (merge `4af08b8`)
- Tag: `v0.73.0` (anotada, pushada)
- Issues fechados: #42 · #44 · #48 · #49 (comentários com o detalhe de cada entrega)
- Issues abertos (gated no dono): #45 (CI) · #46 (Resend) · #47 (flip produção)
- Commits da sessão: `cb7a13d` `e8cc202` `46606d1` `ee6d4a4` `803ab9d` `9785855` → merge `4af08b8` → release `a7ab5d4`
- Migrations MCP da sessão: `rls_fase2_48_tighten_media_writes` · `notif_44_server_side_derived_reconciler`
