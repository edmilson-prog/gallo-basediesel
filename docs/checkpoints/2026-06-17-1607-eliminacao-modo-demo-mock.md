# Checkpoint — Eliminação do modo Demonstração/mock — 2026-06-17T16:07-03:00

> **Branch:** `chore/eliminate-demo-mock-mode` (criada a partir da `main` @ `33428db`) · **Working tree:** só `vite.config.ts` (fix local de dev, NÃO commitar)
> **Sessão anterior:** Claude Opus 4.8 · **Gerado em:** 2026-06-17T16:07-03:00

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-06-17-1607-eliminacao-modo-demo-mock.md` na íntegra
e confirme em uma frase que entendeu: 1) o objetivo (eliminar o modo Demonstração/mock),
2) o estado atual do código, 3) qual é a próxima tarefa (auditoria + brainstorming de escopo).
Não faça nenhuma ação nem toque em código até eu autorizar. A PRIMEIRA coisa é resolver a
QUESTÃO-CHAVE de escopo (seção "Decisões pendentes") comigo.
```

---

## 📌 Contexto do projeto

**GALLO BASE DIESEL** — SPA React 19 (Vite + TanStack Router file-based, Tailwind v4 + shadcn/ui, Zustand, TanStack Query v5), hospedada na Vercel. Backend Supabase. **Em produção desde 2026-06-10** (`crm.gallobasediesel.com.br` roda `supabase` em dados E auth). A arquitetura de dados usa **Provider Pattern**: features consomem `@/providers/data`, e um `factory.ts` resolve `mockProviders` vs `supabaseProviders` por `VITE_DATA_SOURCE` (+ override de runtime por navegador). O **modo Demonstração (mock)** foi a fundação da Fase 1 (Frontend First, sem backend) — hoje é legado que só gera custo.

## 🎯 Objetivo da sessão (nova)

**Eliminar o modo Demonstração/mock da plataforma.** Decisão do dono (2026-06-17): "não tenho o mínimo interesse em manter o modo de demonstração". Na Fase 1 (sem backend) tinha serventia; agora, com produção em supabase, **só atrapalha muito e não traz benefício nenhum** — adiciona manutenção dupla e uma classe inteira de bugs de divergência (cada feature tentando cobrir mock E supabase). Esta sessão é **planejamento + execução** dessa remoção. **Ainda não foi planejada** — começar por brainstorming/auditoria, não por código.

## ✅ Progresso (o que já foi feito — contexto, NÃO é o trabalho desta nova sessão)

- [x] **PR #107 MERGED** — cache do histórico de mensagens (`useMessages` → TanStack `useInfiniteQuery`). Resolveu o "engasgo" ao trocar de conversa.
- [x] **PR #109 MERGED** (`33428db`) — cache do `useConversationDetail` (header/cliente/lead/conta/vendedor → `useQuery` + `keepPreviousData`). Inclui follow-up de code-review (commit `77c0e8b`): removeu campo morto `isPlaceholder`, interface via `extends`, restaurou semântica de id vazio `!!`/`!`, comentários precisos.
- [x] **Decisão de eliminar o mock tomada e registrada** (memória `project_eliminate_demo_mock_mode.md`).
- [x] **DESCOBERTA que disparou a decisão** (detalhada abaixo) — a revisão xhigh do #109 expôs a divergência mock vs supabase no tratamento de "não encontrado".

## 🔬 A DESCOBERTA — por que o mock atrapalha (detalhe técnico)

O `/code-review` xhigh do PR #109 (9 ângulos → 14 candidatos → 7 sobreviventes) revelou que o `useConversationDetail` usava um **string-match frágil** para pontear dois backends que sinalizam "não encontrado" de formas **incompatíveis**:

- **Mock:** `conversations.get(id)` de id inexistente lança `Error("...not found...")`. O hook casa `/not found/i` → retorna `{ notFound: true }` como **DADO** (cacheável).
- **Supabase:** o mesmo caso → `.single()` com 0 linhas → erro PostgREST **`PGRST116`** (mensagem `"...failed: JSON object requested, multiple (or no) rows returned"`), que **NÃO contém "not found"** → o hook re-lança → vira `query.error` → a página cai no EmptyState pelo guard `!conversation`.

**Consequências em produção (supabase):**
1. "conversa inexistente", "sem permissão (RLS retorna 0 linhas)" e "erro transitório de rede/500" ficam **indistinguíveis** — os três são "um erro lançado com mensagem opaca".
2. O sentinela `notFound` é **efetivamente mock-only**.
3. TanStack v5 **descarta o placeholder em erro** (`query-core/queryObserver.js:216` exige `status === 'pending'`), então um erro transitório ao abrir uma conversa vira "conversa não encontrada" e **persiste** (o hook usa `retry: false`) até o usuário sair e voltar.

**Achados de correção do #109 NÃO corrigidos (documentados, baixa severidade) — eles SOMEM ou ficam triviais sem mock:**
- #1/#2: trocar DE conversa not-found PARA válida pisca o EmptyState (mock-only).
- #3: erro transitório ao abrir → EmptyState persistente.
- **Fix correto = `NotFoundError` tipado nos providers + estado de erro com "tentar novamente"** — que vira trivial quando só existe UM backend (supabase). Por isso o fix de erro foi **dobrado nesta eliminação** em vez de virar PR próprio.

## 🗺️ Mapa do que a eliminação toca (auditar e confirmar antes de mexer)

| Área | Caminho(s) | O que fazer |
|---|---|---|
| Camada mock inteira | `src/mocks/` (api, data, generators, store, hooks, config, seed determinístico via `seedrandom`+faker) | Remover OU isolar como fixture de teste (ver decisão-chave) |
| Providers mock | `src/providers/data/impl/mock/` (47 arquivos / ~37 providers) | Remover ou isolar |
| Factory / switch | `src/providers/data/factory.ts` (resolve por `VITE_DATA_SOURCE`) · `src/features/auth/authSource.ts` (`VITE_AUTH_SOURCE`) | Simplificar para supabase-only |
| Switch de runtime | `src/shared/lib/environmentMode.ts` (override `localStorage` `gallo-data-source-override`/`gallo-auth-source-override`) | Remover |
| UI do modo demo | `src/routes/app.configuracoes.ambiente.tsx` (tela "Ambiente & Dados") · `src/features/shell/components/DemoModeBanner.tsx` · badge no TopBar · badge na tela de saúde | Remover |
| Sidebar gating | `src/features/shell/layouts/SettingsLayout.tsx` (flag `demoOnly`) | Remover flag |
| ⚠️ Área de IA | área "Configurações → Inteligência artificial" (v0.100.0 Synapse) está **gated `demoOnly`** — só aparece fora de produção porque `supabaseAiProvider` é stub `NotImplementedError` | **DECIDIR o destino** — remover a área, ou ativar o provider real, ou esconder por outra flag (ver [[project_ai_llm_settings_planned]]: o sub-projeto Cortex/`ai-generate` já existe numa worktree) |
| Fronteiras ESLint | `eslint.config.js` (`no-restricted-imports` contra `@/mocks` e `impl/*`) | Relaxar/remover conforme o destino do mock |
| design-system | `src/routes/design-system.tsx` (usa util de reset de seed do mock) | Ajustar |
| Env/tipos/docs | `.env.example`, `src/vite-env.d.ts` (`VITE_DATA_SOURCE`/`VITE_AUTH_SOURCE`), `docs/dev/environment-mode.md` | Atualizar/remover |
| Tratamento de erro | `src/features/conversations/hooks/useConversationDetail.ts` (`/not found/i`), `src/providers/data/errors.ts` (criar `NotFoundError`), `impl/supabase/conversations.ts` (detectar `PGRST116`), `ConversationPage.tsx` (estado de erro c/ retry) | Implementar o fix tipado supabase-only |

## ⏳ Pendências (próximos passos, EM ORDEM)

1. **Resolver a QUESTÃO-CHAVE de escopo com o dono** (ver "Decisões pendentes"). Bloqueia tudo. Critério de feito: dono escolheu "mock sai inteiro" OU "mock vira fixture de teste".
2. **Auditar dependência dos testes no mock.** Os ~802 testes (102 arquivos) passam hoje. Mapear quais REALMENTE dependem do seed/mock vs quais são `engine/` puros. Comando inicial: `grep -rl "@/mocks\|impl/mock\|mockProviders\|resetSeed" src --include="*.test.ts*"`. Critério: lista clara de testes acoplados ao mock.
3. **Decidir destino da área de IA** (gated `demoOnly`). Critério: plano para a área (remover / ativar Cortex / re-gate).
4. **Brainstorming + plano por fases** (usar skills `superpowers:brainstorming` → `writing-plans`). Critério: plano escrito em `docs/superpowers/plans/`.
5. **Executar por fases** (sugestão): (a) fix de erro tipado supabase-only no detail; (b) remover UI do modo demo (tela Ambiente, banner, badges, demoOnly); (c) colapsar factory/authSource para supabase-only; (d) remover/isolar `src/mocks` + `impl/mock`; (e) limpar ESLint/env/docs. Cada fase = 1 PR verde (`bun run build` + `bun run test`).

## ❓ Decisões pendentes

- **QUESTÃO-CHAVE: o mock sai INTEIRO ou fica como FIXTURE DE TESTE?**
  - Opção A — **Remoção total** (mock + impl/mock + seed): mais limpo, zero divergência. Contra: precisa de nova estratégia de teste (mockar supabase nos testes que hoje usam seed determinístico) — risco de quebrar parte dos 802 testes.
  - Opção B — **Remover só o modo Demonstração visível + switching de runtime**, mantendo `impl/mock` como fixture exclusivo de teste (sem UI, sem env switch, app sempre supabase): menor risco, preserva a suíte. Contra: o mock continua existindo no repo (manutenção parcial).
  - **Inclinação atual:** B é o caminho de menor risco para destravar rápido; A é o objetivo final. Provavelmente **B agora, A como faxina posterior**. **O dono decide.**
- **Destino da área de IA (Synapse, hoje `demoOnly`):** remover / ativar o provider real (Cortex já existe — worktree `feat+ai-llm-real-integration`) / re-gate por outra flag. Ver [[project_ai_llm_settings_planned]].

## 🚧 Bloqueios / Riscos

- **Testes acoplados ao seed do mock** — risco principal. Sem a auditoria (passo 2), uma remoção quebra a suíte às cegas.
- **`.env.local` LOCAL aponta para PRODUÇÃO** (não mock!) — qualquer teste manual mexe em dados reais. Cuidado redobrado.
- A área de IA depende dessa decisão — não remover o `demoOnly` dela sem antes decidir o destino.

## ⚠️ Avisos do usuário (regras desta linha de trabalho)

- **O dono testa a UI MANUALMENTE** — NÃO abrir browser/preview (Claude_Preview/Chrome) para validar. Subir dev server para ELE testar é ok.
- **`vite.config.ts` tem um fix LOCAL de dev** (host 127.0.0.1, strictPort, hmr) que **NÃO deve ser commitado** — preservar como mudança de working tree.
- **`src/routeTree.gen.ts` é gerado** (falso-sujo, CRLF) — descartar antes de operações de git; nunca commitar.
- **`.env.local` aponta para o supabase de PRODUÇÃO.**
- `bunfig.toml` impõe guarda de supply-chain de 24h — confirmar com o dono antes de adicionar pacote a `minimumReleaseAgeExcludes`.
- **Ignorar `.claude/worktrees/`** — worktrees isoladas de outras branches, fora da `main`.
- Gate de CI prático: `bun run build` + `bun run test` (o build NÃO faz type-check; `bunx tsc --noEmit` tem baseline de ~316 erros — avaliar por delta).

## 🛡️ Não regredir (deve continuar funcionando)

- Produção em supabase (dados + auth) — login por e-mail/senha, RLS per-seller, `base_role`.
- Inbox WhatsApp real (Evolution multi-instância), envio/recebimento, status, mídia.
- Os caches recém-entregues: `useMessages` (#107) e `useConversationDetail` (#109) — fluidez ao trocar de conversa.
- A suíte de 802 testes deve continuar verde a cada fase.

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `src/providers/data/factory.ts` — o switch mock↔supabase (coração da eliminação).
- `src/features/auth/authSource.ts` — switch de auth.
- `src/shared/lib/environmentMode.ts` — override de runtime (Demonstração↔Produção).
- `src/routes/app.configuracoes.ambiente.tsx` + `src/features/shell/components/DemoModeBanner.tsx` — UI do modo demo.
- `src/features/shell/layouts/SettingsLayout.tsx` — gating `demoOnly` (sidebar, inclui a área de IA).
- `eslint.config.js` — fronteiras `no-restricted-imports` de `@/mocks`.
- `docs/dev/environment-mode.md` — doc do switch (v0.86.0 Lever).
- `src/features/conversations/hooks/useConversationDetail.ts` — onde vive o `/not found/i` a substituir por `NotFoundError` tipado.
- `CLAUDE.md` — convenções do projeto.

## 🧠 Memórias relacionadas (em `~/.claude/projects/D--claude-gallo-basediesel/memory/`)

- `project_eliminate_demo_mock_mode.md` — **a decisão e o mapa** (esta linha de trabalho).
- `project_conversation_message_cache.md` — os caches #107/#109 e os achados do review.
- `project_ai_llm_settings_planned.md` — área de IA (Synapse mock + Cortex real); relevante para o gating `demoOnly`.
- `project_dev_points_to_prod_and_admin_identity.md` — `.env.local` aponta p/ produção; identidade admin.
- `feedback_manual_testing.md` — o dono testa a UI manualmente.
- `project_routetree_merge_block.md` / `project_git_autocrlf_subagents.md` — armadilhas de git.

## 📚 Referências

- PRs entregues: [#107](https://github.com/edmilson-prog/gallo-basediesel/pull/107) (message cache), [#109](https://github.com/edmilson-prog/gallo-basediesel/pull/109) (detail cache, MERGED `33428db`).
- Decisão direcional: memória `project_eliminate_demo_mock_mode.md`.
