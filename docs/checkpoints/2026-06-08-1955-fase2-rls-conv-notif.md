# Checkpoint — Fase 2: RLS + conversations.create + notificações — 2026-06-08T19:55:15-03:00

> **Branch:** `feat/fase2-supabase-cutover` · **Último commit:** `d6bdfe5` feat(fase2): implement Supabase notification providers (PRD-104 MVP)
> **Sessão anterior:** Claude Opus 4.8 · **Gerado em:** 2026-06-08T19:55:15-03:00
> **PR:** [#39](https://github.com/edmilson-prog/gallo-basediesel/pull/39) (draft, **não mergear**) · 3 commits à frente da `main`

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-06-08-1955-fase2-rls-conv-notif.md` na íntegra e
confirme em uma frase que entendeu: 1) o objetivo da sessão, 2) o estado atual do código,
3) qual é a próxima tarefa. Não faça nenhuma ação até eu autorizar.
```

---

## 📌 Contexto do projeto

**GALLO BASE DIESEL** — SaaS de inteligência comercial (distribuidora de peças pesadas, Frederico Westphalen/RS). React 19 + Vite + TanStack Router/Query + Zustand + Tailwind v4/shadcn. SPA estática (Vercel). Arquitetura feature-driven com **Provider Pattern** (`@/providers/data`, switch `VITE_DATA_SOURCE=mock|supabase`) + subsistema de notificações próprio (`@/providers/notifications`). Estamos na **Fase 2** (migração Mock → Supabase). Projeto Supabase ref `njizaasajkdqptlxddqn`, via MCP. App roda **`mock` por default**; o `.env.local` local está em `supabase` (auth+data) para teste.

## 🎯 Objetivo da sessão

Tornar o modo `supabase` **utilizável de ponta a ponta** para o owner logado, na filosofia acordada pelo usuário: **"implementa o que falta, depois vamos corrigindo"** — e consolidar tudo num **PR de longa duração (#39), sem merge, atualizando até concluir**. Pontos: (1) escrita não funcionava sob RLS; (2) ao flipar para `supabase` o banner de "quebra de origem" aparecia sem dizer o quê falhava; (3) subsistema de notificações era stub e disparava esse banner em toda tela.

## ✅ Progresso (o que foi feito)

- [x] **Banner de origem classificado**, commit `fdb080c` — `useDataHealth` passou a capturar QUAIS queries falham (queryKey → rótulo pt-BR + fallback humanizado) e classificar **gap conhecido** (`error.name==='NotImplementedError'`) vs **falha real**; `DataSourceBanner` mostra âmbar "ainda não disponível no Supabase" vs vermelho crítico "não foi possível carregar: X"; loga detalhe no console em DEV.
- [x] **PRD-103 (MVP adaptado) — write RLS policies**, migrations remotas via MCP (`rls_helpers_identity`, `rls_policies_store_direct`, `rls_policies_derived_global`, `rls_helpers_security_invoker`) + doc `docs/db/rls-policies-fase2-mvp.md` (commit `fdb080c`). Helpers de identidade `public.current_store_id/seller_id/app_role/is_staff` (`SECURITY INVOKER`, lêem `profiles` por `auth.uid()`, EXECUTE só `authenticated`). Policies por loja (SELECT+INSERT+UPDATE+DELETE) em **36 tabelas**; `anon` removido do CRM (fechou vazamento); `audit_logs` imutável; `sellers`/`vehicle_models`/`stores` escrita restrita a staff. Validado: leitura do owner OK, escrita same-store OK, isolamento fail-closed OK, advisors limpos.
- [x] **`conversations.create` no Supabase**, commit `a99dd43` — último stub de data provider; motor PRD-013 (`distributeConversation`) + persistência de conversa + mensagens (entrante/system) + `distribution_traces` + cursor round-robin (writes não-atômicos, paridade com o mock). **33/33 data providers Supabase implementados.**
- [x] **PRD-104 (MVP) — notificações no Supabase**, commit `d6bdfe5` + migration MCP `create_notifications_tables` — tabelas `public.notifications` + `public.notification_preferences` com RLS; providers `supabaseNotificationStore` + `supabaseNotificationPreferenceStore` reescritos (stub→real). **Banner âmbar confirmado SUMIDO na UI pelo usuário.**
- [x] **Validações**: `bun run build` ✓, `bun run test` ✓ **244/244** após cada etapa; `tsc` delta e `eslint` limpos nos arquivos tocados; testes de RLS via MCP (impersonando o owner com `set request.jwt.claims`).
- [x] Memória `project_fase2_supabase_kickoff.md` atualizada (PRD-103 + banner + PRD-104 + correções de itens obsoletos).

## 🔧 Estado do código

- **Branch:** `feat/fase2-supabase-cutover` (== `origin/...`; 3 commits à frente da `main`).
- **Último commit:** `d6bdfe5`.
- **Working tree:** só ruído — `src/routeTree.gen.ts` (M, gerado; **não commitar**) + `docs/relatorio-codigo-morto-2026-06-04.md` e `knip.json` (untracked, pré-existentes, não desta sessão).
- **Arquivos tocados vs `main`:**
  - `docs/db/rls-policies-fase2-mvp.md` (A) — doc das policies PRD-103.
  - `src/features/shell/hooks/useDataHealth.ts` (M) — coleta+classifica falhas.
  - `src/features/shell/components/DataSourceBanner.tsx` (M) — âmbar vs crítico.
  - `src/providers/data/impl/supabase/conversations.ts` (M) — `create` implementado.
  - `src/providers/notifications/impl/supabase/notifications.ts` (M) — store real.
  - `src/providers/notifications/impl/supabase/preferences.ts` (M) — prefs real.
- **Migrations Supabase (no remoto, via MCP — NÃO há arquivos locais):** `rls_helpers_identity`, `rls_policies_store_direct`, `rls_policies_derived_global`, `rls_helpers_security_invoker`, `create_notifications_tables`.
- **Build/testes:** PASS (build + 244 testes).
- **PR:** #39 (draft) — corpo com checklist atualizado (Feito: PRD-103, banner, conversations.create, PRD-104).

## ⏳ Pendências (próximos passos, em ordem)

1. **PRD-107 — habilitar o Custom Access Token Hook** (Auth → Hooks no dashboard Supabase). **Ação do USUÁRIO** (não dá via MCP de dados). A função `public.custom_access_token_hook` já existe (`search_path=''`). Feito = JWT carrega `app_metadata` (role/store_id/seller_id). Depois: **migrar o corpo das 4 helpers** (`current_store_id/seller_id/app_role`, e o gate de `is_staff`) de "ler `profiles`" para "ler `auth.jwt() -> 'app_metadata'`" — **as policies NÃO mudam** (arquivos: migration MCP nova). Critério: leitura/escrita seguem funcionando com claims; advisor `auth_rls_initplan` melhora.
2. **Vínculo owner↔seller** — `profiles.seller_id` é **null** para o owner (`admin@ailainteligente.com`). Hoje o owner age como recipiente/escopo via `is_staff()`, não via `seller_id`. Decidir se o owner deve ter um `seller_id` real (linha em `sellers`) e popular `profiles.seller_id`. Arquivos: SQL via MCP + possivelmente `seedStore`/seed. Critério: `current_seller_id()` não-null para o owner; notificações endereçadas a ele casam por recipiente.
3. **RBAC fino (isolamento de carteira)** — hoje owner/manager fazem tudo na loja e vendedor casa por `current_seller_id()`, mas não há logins de vendedor reais para validar. Refinar policies por-vendedor/B2B quando houver multiusuário. Arquivos: migrations MCP. Critério: vendedor A não vê cliente de B (teste pgTAP).
4. **Perf (PRD-108)** — indexar FKs de ator/loja; otimizar inicialização de RLS (advisor `auth_rls_initplan`); avaliar custo das subqueries derivadas (order_items→orders, etc.) e do `current_*()` por linha. Não bloqueante.
5. **Testes pgTAP + workflow CI** (`rls-tests.yml`) e **storefront anon** (loja B2C em `supabase` precisa de policies `anon` de catálogo — hoje `anon` não tem acesso ao CRM).
6. **(Baixa) Seed de `vehicle_models`/`model_kits`** — não semeados (vêm de seed estático; `vehicles.model_id` é text e aceita o id-string canônico). E `messages.simulateIncoming` segue no-op intencional.

## ❓ Decisões pendentes

- **Próximo alvo da sessão seguinte:** o usuário foi perguntado e ainda não escolheu entre:
  - **A) PRD-107** (requer ação dele no dashboard) — inclinação: alta (destrava identidade "de verdade" e perf).
  - **B) Item solo** (RBAC fino / owner↔seller / perf) — eu toco sem depender dele.
  - **C) Pausar** — este é um bom ponto de parada (foi o que motivou este checkpoint).
- **`reconcileDerived` (notificações):** escolhi **não** "piscar" lido→não-lido a cada poll (deixo notificação ativa intacta) — leve divergência intencional do mock (melhor UX). Reavaliar se o usuário quiser paridade exata.

## 🚧 Bloqueios / Riscos

- **PRD-107 depende de ação no dashboard** (habilitar hook) — não automatizável via MCP de dados.
- **Migrations só no remoto** (convenção atual): não há `supabase/migrations/*.sql` local; o diff de código do PR **não** contém o DDL. Fonte de verdade: `docs/db/rls-policies-fase2-mvp.md` + histórico de migrations no remoto (MCP `list_migrations`).
- **Multi-write não-atômico** em `conversations.create` e `reconcileDerived` (sem transação client-side; paridade com o mock) — atomicidade real fica para Edge Functions.
- **`audit_logs` na escrita:** se uma mutação na UI disparar INSERT de auditoria sem `store_id` preenchido pelo provider, a auditoria pode falhar (a operação principal não). Não observado ainda; ajustar se aparecer.

## ⚠️ Avisos do usuário (regras desta sessão)

- **"Não mergear; só PR, atualizando até concluir."** O PR #39 fica **draft**. Trabalho novo = commit na branch `feat/fase2-supabase-cutover`.
- **"Implementa o que falta, depois vamos corrigindo"** — priorizar destravar o cutover; lapidação (testes/RBAC fino/perf) vem depois. Mas **sem atalho de segurança**.
- **Nunca abrir policy de escrita para `anon`** (foi negado pelo classificador, com razão). Não tentar de novo.
- **Nunca `service_role` no cliente.** A `SUPABASE_SERVICE_ROLE_KEY` vive SÓ no `.env.local` (sem `VITE_`, gitignored) e SÓ para o seeder. **Não ler o valor do arquivo.**
- **Muito cuidado com regressões** — validar build+test a cada etapa; preferir adicionar a alterar.
- **`routeTree.gen.ts`** é gerado/ruído — **nunca commitar**. **CRLF** nos warnings do git é falso-positivo (git guarda LF).
- **Ignorar completamente `.claude/worktrees/`**.
- **Usuário testa a UI manualmente** (ele abre o browser e cola erros do console quando preciso) — não abrir browser/preview para validar.
- **`bunfig.toml`** impõe guarda de supply-chain de 24h — confirmar antes de mexer em `minimumReleaseAgeExcludes`.
- Responder sempre em **pt-BR com acentuação correta**.

## 🛡️ Não regredir (features que devem continuar funcionando)

- **Modo `mock` (default)** — 100% intacto; é o que o app usa por padrão. As mudanças desta sessão são em providers Supabase + RLS (não afetam o mock) e no banner (que só dispara em falha).
- **Login Supabase vivo** (`admin@ailainteligente.com`, role `owner`, `store_id` = sentinela `00000000-0000-0000-0000-000000000001`). `AUTH=supabase + DATA=mock` continua funcionando.
- **Leitura no Supabase** para o owner (clientes 70, pedidos 477, etc.) — não pode voltar a falhar.
- **Escrita no Supabase** para o owner (RLS PRD-103) — criar/editar/excluir funciona.
- **Notificações no Supabase** — sininho/dropdown carregam, reconciler não lança; **banner âmbar não volta**.
- **244 testes** (Vitest) verdes + **build** de produção sem erro.

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `docs/db/rls-policies-fase2-mvp.md` — fonte de verdade das policies RLS (helpers, buckets, validação, deferido).
- `src/providers/data/impl/supabase/conversations.ts` — `create` (padrão de orquestração client-side).
- `src/providers/notifications/impl/supabase/notifications.ts` + `preferences.ts` — providers de notificação (RLS faz o escopo; `reconcileDerived`).
- `src/features/shell/hooks/useDataHealth.ts` + `components/DataSourceBanner.tsx` — banner de origem.
- `src/providers/data/impl/supabase/settings.ts` / `sellers.ts` — padrão de mapper/contrato a seguir.
- `CLAUDE.md` — convenções do projeto. `docs/prds/PRD-103-rls.md`, `PRD-107-auth-custom-claims.md`, `PRD-108-performance.md`.

## 🧠 Memórias relacionadas

- `project_fase2_supabase_kickoff.md` — **fonte de verdade** da Fase 2: PK uuid + sentinela, seed, PRD-103 (RLS), banner, PRD-104 (notificações), o que falta. Atualizada nesta sessão.
- `project_tsc_baseline_errors.md` — `tsc` tem ~315 erros baseline; gate real é build+test; avaliar código novo por delta.
- `project_git_autocrlf_subagents.md` — CRLF é falso-positivo.
- `feedback_manual_testing.md` — usuário testa UI manualmente.
- `project_devserver_stale_branch.md` — reiniciar dev server ao trocar env/branch; porta gallo=5173.

## 📊 Atividade recente (telemetria)

Sem `.claude-metrics/annotations.jsonl` no projeto — telemetria não ativa.

## 📚 Referências

- PR: https://github.com/edmilson-prog/gallo-basediesel/pull/39 (draft)
- Commits da sessão: `fdb080c` (banner + PRD-103 RLS), `a99dd43` (conversations.create), `d6bdfe5` (PRD-104 notificações).
- Migrations remotas (MCP): `rls_helpers_identity`, `rls_policies_store_direct`, `rls_policies_derived_global`, `rls_helpers_security_invoker`, `create_notifications_tables`.
- Checkpoint anterior: `docs/checkpoints/2026-06-08-1703-fase2-uuid-migration-seed.md` (uuid migration + seed de dados).
