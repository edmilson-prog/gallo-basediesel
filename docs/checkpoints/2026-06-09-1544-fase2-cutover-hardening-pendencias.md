# Checkpoint — Fase 2 cutover: hardening do /app + registro de pendências — 2026-06-09T15:44

> **Branch:** `feat/fase2-supabase-cutover` · **Último commit:** `7d16f0f` docs(fase2): link pendencies doc to issues #45-#49
> **Sessão anterior:** Claude Opus 4.8 · **Gerado em:** 2026-06-09 15:44 (-0000)

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-06-09-1544-fase2-cutover-hardening-pendencias.md` na íntegra
e confirme em uma frase que entendeu: 1) o objetivo da sessão, 2) o estado atual do código,
3) qual é a próxima tarefa. Não faça nenhuma ação até eu autorizar.

Doc mestre de pendências: docs/fase2-pendencias.md · PR: #39 (draft)
```

---

## 📌 Contexto do projeto

**GALLO BASE DIESEL** — SaaS de inteligência comercial (distribuidora de peças pesadas), Vite + React 19 + TS strict, TanStack Router/Query, Zustand, Tailwind v4/shadcn. **Provider Pattern** (`@/providers/data`, 34 providers) com switch Mock↔Supabase por env (`VITE_DATA_SOURCE`/`VITE_AUTH_SOURCE`, build-time, **default `mock`**). **Fase 2 = cutover Mock→Supabase**: backend já materializado (39 tabelas + RLS, auth real + Custom Access Token Hook que injeta `app_metadata.role/seller_id/store_id` no JWT). Supabase project ref `njizaasajkdqptlxddqn`; migrations aplicadas **só via MCP `apply_migration`** (sem arquivos locais em `supabase/migrations/`).

## 🎯 Objetivo da sessão

Continuar o cutover focando no **`/app`** (a loja é deferida). Concretamente: (1) fechar o issue de escopo RLS #43; (2) validar o `/app` no Supabase via smoke; (3) corrigir bugs surgidos no smoke manual do usuário; (4) entregar testes de RLS versionados (#5); (5) **registrar todas as pendências** num doc mestre com issues como ponteiros. Disparado pela meta `/goal "conclua a fase 2"` (Stop hook ativo).

## ✅ Progresso (o que foi feito)

- [x] **#43 RLS scoping** — migration MCP `rls_fase2_43_tighten_audit_transfers_media`: `audit_logs` SELECT → staff+financeiro; `carteira_transfers` → staff (read+writes); `media_assets` SELECT → dono via customer/conversation. Validado por impersonação (Lucas 40/8/90 → **0/0/36**). Doc + issue #43 fechado. Commit `60ca045`.
- [x] **Smoke de RLS** (owner/seller/anon/fail-closed) verde — `docs/db/cutover-smoke-checklist.md` §7. Commit `1264f63`.
- [x] **Flip Preview** — env `supabase` escopado ao Preview da Vercel (produção segue mock). Doc §8. Commit `a00b159`.
- [x] **fix(shell)** menu "Comissões" liberado p/ Gestor/Vendedor/Financeiro. Commit `06dc6fc`.
- [x] **fix(conversations)** inbox por `seller_id` (não user id) + pool liberado a vendedores. Commit `715bae0`.
- [x] **fix(commissions)** coluna PEDIDO mostra nº (`#PD-…`) via embed `order:orders(number)` em vez do UUID. Commit `c773d80`.
- [x] **Varredura seller-id** — 6 bugs do mesmo tipo (`currentUser.id` onde se espera `sellerId`): useSegments (filtro+create), SharedSnippetsManager, useSendAsset (recordSend), useCopilotChat, UrgentBroadcastClaim. Commit `f2a663a`.
- [x] **#5 Testes de RLS + CI** — `supabase/tests/rls-regression.sql` (SQL puro, sem pgTAP, validado verde via MCP) + `.github/workflows/rls-tests.yml` (no-op até secret). `CLAUDE.md` corrigido (providers não são stubs). Commit `a47de19`.
- [x] **Pendências registradas** — `docs/fase2-pendencias.md` (fonte da verdade) + issues #45–#49 criados + comentários em #40/#41/#42/#44 + comment-umbrella no PR #39. Commits `0bb7937`, `7d16f0f`.

## 🔧 Estado do código

- **Branch:** `feat/fase2-supabase-cutover` (44 commits à frente da `main`). **Upstream OK** (tudo pushado).
- **Último commit:** `7d16f0f`.
- **Working tree:** **nada meu** — só `src/routeTree.gen.ts` (gerado, ignorar) + untracked alheios (PRDs 111‑129, `relatorio-codigo-morto-…md`, `knip.json`). **Não commitar nada disso.**
- **Build/testes:** `bun run build` ✅ · `bun run test` **244/244** ✅ · `tsc --noEmit` delta limpo (os ~4 erros restantes são baseline `prev implicit-any`).
- **Migrations Supabase aplicadas nesta sessão (via MCP):** `rls_fase2_43_tighten_audit_transfers_media`.
- **PRs:** **#39** (draft) — Supabase cutover. **NÃO MERGEAR** (ver avisos).

## ⏳ Pendências (próximos passos, em ordem) — fonte: `docs/fase2-pendencias.md`

Todas **gated no dono** ou loja-deferida. Issues são ponteiros para o doc mestre.

1. **#42 (loja handoff)** — *oferecido como próximo*: redesenhar "Finalizar compra" → handoff WhatsApp/orçamento. Frontend leve, sem backend. **Critério:** loja em `supabase` não cai no checkout que falha. **Destrava** o flip de produção (#47) com segurança. Arquivos: `storefront-cart/pages/CheckoutPage.tsx`.
2. **#45 (ativar CI)** — adicionar secret de repositório `SUPABASE_DB_URL`. **Critério:** workflow roda verde (não no-op). Só ação do dono.
3. **#47 (flip de produção)** — decisão do dono; env Vercel escopo Production. Pré: #42 se houver tráfego.
4. **Merge do PR #39** (§A4) — só com "go" explícito; higiene: descartar `routeTree.gen.ts`, não arrastar untracked alheios, marcar ready.
5. **#46 (Resend)**, **#48 (media write RLS)**, **#49 (addNote author)**, **#44 (notif server-side)** — conforme prioridade.
6. **Loja transacional** #40 (checkout) / #41 (conta B2C) — fase própria, deferida.

## ❓ Decisões pendentes

- **Definição de "Fase 2 fechada"** (controla o merge): **(A)** só `/app` (loja vira fase própria) → pode mergear já; **(B)** inclui loja transacional → falta frente grande (#40/#41/#42). **Inclinação:** A (a loja foi deferida por decisão registrada). Usuário ainda não bateu o martelo.
- **Próximo passo imediato:** usuário foi perguntado se quer que eu faça **#42 (handoff)** agora ou pare com tudo documentado. **Sem resposta ainda** (invocou /checkpoint).

## 🚧 Bloqueios / Riscos

- **pgTAP não instalável** sem consentimento explícito do dono (classifier bloqueou `create extension pgtap` — mudança de infra compartilhada). Por isso os testes de RLS foram feitos em **SQL puro** (sem extensão). Não reinstalar sem consentimento.
- **#45/#46/#47** dependem de infra do dono (secret CI / conta Resend / decisão de flip) — não dá para fechar sozinho.
- **Loja no Preview hoje quebra** no checkout/conta B2C (auth mock) — esperado/deferido; só relevante se a loja receber tráfego (daí #42).

## ⚠️ Avisos do usuário (regras desta sessão — CRÍTICO)

- **PR #39 fica DRAFT e NUNCA mergeia até a Fase 2 fechar** — confirmado nesta sessão (usuário tentou "vamos mergear", eu segurei e ele recuou).
- **Meta ativa:** `/goal "conclua a fase 2"` (Stop hook). Trabalhar rumo a isso; o que falta é gated no dono.
- **`service_role` NUNCA no cliente** (só `.env.local`, sem prefixo `VITE_`, gitignored — não ler o valor).
- **Não instalar extensões / alterar infra compartilhada** (ex.: pgTAP) sem consentimento explícito.
- **Abrir policy de WRITE para `anon` é PROIBIDO.**
- **Usuário testa a UI manualmente** (cola erros de console) — **não abrir browser/preview**.
- **`src/routeTree.gen.ts`** é gerado (ruído) — nunca commitar; descartar antes de mergear.
- **Ignorar `.claude/worktrees/`** por completo.
- Avisos CRLF do git são **falso-positivo**. `bunfig` tem guarda supply-chain 24h (confirmar antes de `minimumReleaseAgeExcludes`).
- **Responder sempre em pt-BR** com acentuação correta. **Commits:** Conventional Commits em inglês, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Protocolo AILA: explorar → planejar → **aguardar "confirma"** antes de implementar mudanças substantivas.
- Fluxo p/ senha/convite de vendedor: via Edge Functions que o dono dispara (não inventar credenciais).

## 🛡️ Não regredir (deve continuar funcionando)

- **Isolamento per-seller (RLS Slices 1–4 + #43)** — vendedor vê só a própria carteira; staff vê a loja. Validado por `supabase/tests/rls-regression.sql`.
- **Inbox** — filtro "Atribuídas a mim" popula + filtros de pool ("Sem atribuição"/"Em fila") + reivindicar (usa `seller_id`).
- **Comissões** — menu visível p/ vendedor + coluna PEDIDO com nº legível.
- **Storefront anon** — catálogo público (colunas limitadas), RPCs `storefront_config`/`storefront_top_selling`, sem vazar custo/margem.
- **Default `mock` intacto** — produção e testes locais rodam mock; supabase é opt-in por env.
- **Auth real** — login owner + vendedor; reconciliador de notificações gated a staff (sem 403).

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `docs/fase2-pendencias.md` — **fonte da verdade** das pendências (grupos A/B/C + ordem). Issues #45–#49, #40–42, #44 apontam aqui.
- `docs/prds/ROADMAP-FASE2-BACKEND-GAP-2026-06-09.md` — gap analysis / estado de execução.
- `docs/db/rls-policies-fase2-mvp.md` — todas as policies/migrations RLS (inclui §#43).
- `docs/db/cutover-smoke-checklist.md` — como ligar supabase local + smoke (§7 resultados, §8 flip Preview).
- `supabase/tests/rls-regression.sql` + `.github/workflows/rls-tests.yml` — testes de RLS + CI (#5).
- `src/features/conversations/{pages/InboxPage.tsx,hooks/useInboxFilters.ts,components/QuickActions.tsx,components/InboxFilters.tsx}` — fixes seller-id/pool.
- `src/features/auth/{roleMap.ts,SupabaseAuthProvider.tsx,guards.ts}` — mapeamento papel/JWT.
- `CLAUDE.md` — convenções do projeto.

## 🧠 Memórias relacionadas

- `project_fase2_supabase_kickoff` — kickoff da migração (backend completo, hook habilitado, convenção snake_case+mapper+jsonb+uuid).
- `project_routetree_merge_block` — `routeTree.gen.ts` suja o tree e trava ff do `gh pr merge`; descartar antes.
- `project_tsc_baseline_errors` — `tsc` tem baseline; avaliar código novo por delta; gate real é build+test.
- `feedback_manual_testing` — usuário testa UI manualmente; não abrir browser/preview.
- `project_git_autocrlf_subagents` — CRLF é falso-positivo; subagentes não trocam de branch.

## 📊 Atividade recente (telemetria)

Sem `.claude-metrics/annotations.jsonl` no projeto (telemetria não ativa).

## 📚 Referências

- PR: https://github.com/edmilson-prog/gallo-basediesel/pull/39 (draft)
- Issues criados: #45 (CI), #46 (Resend), #47 (flip prod), #48 (media write), #49 (addNote). Loja: #40/#41/#42. Notif: #44.
- Commits da sessão: `1b7f685` (sessão anterior) → `60ca045` `1264f63` `a00b159` `06dc6fc` `715bae0` `c773d80` `f2a663a` `a47de19` `0bb7937` `7d16f0f`.
