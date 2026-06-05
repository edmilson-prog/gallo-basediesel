# Checkpoint — Copiloto Analítico página multi-modo + release v0.66.0 Oracle — 2026-06-05T14:49:29-0300

> **Branch:** `main` · **Último commit:** `6f34f7e` Merge pull request #36 · **Tag:** `v0.66.0`
> **Sessão anterior:** Claude Opus 4.8 (1M context) · **Gerado em:** 2026-06-05T14:49:29-0300

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-06-05-1449-copiloto-multimodo-oracle.md` na íntegra
e confirme em uma frase que entendeu: 1) o objetivo da sessão, 2) o estado atual do código,
3) qual é a próxima tarefa. Não faça nenhuma ação até eu autorizar.
```

---

## 📌 Contexto do projeto

GALLO BASE DIESEL — SaaS de inteligência comercial para distribuidora de peças pesadas (Volvo/Scania/Mercedes/Ford Cargo/Iveco). SPA React 19 + TS strict + Vite + TanStack Router (file-based) + TanStack Query + Tailwind v4 + shadcn/ui, feature-based em `src/features/`. Dados via **provider pattern** (`useDataProviderSlice`, mock|supabase por `VITE_DATA_SOURCE`). Desenvolvimento dirigido por PRDs em `docs/prds/`. Esta sessão evoluiu o **Copiloto Analítico (PRD-057)** para uma página dedicada multi-modo e fechou o **release v0.66.0 "Oracle"**.

## 🎯 Objetivo da sessão

Migrar o Copiloto Analítico de um **`Sheet` lateral** (botão na TopBar) para uma **página dedicada** em `/app/gestao/copiloto`, acessível pelo menu lateral, com **seletor de 3 modos** (Foco/Histórico/Split) alternáveis e persistidos, e tratamento visual premium (hero, answer card turbinado, sessões, painel de detalhe). Pedido do usuário: "ao invés de colocar na barra e exibir com sheet, quero no sidebar com página dedicada", com apoio do agente de design para o visual. Ao final, fechar o release (bump + changelog + PRDs `_DONE`).

## ✅ Progresso (o que foi feito) — SESSÃO COMPLETA

Fluxo superpowers: brainstorming (+ 2 rodadas com `design-specialist`) → spec → 2 planos → execução subagent-driven (via workflows) → revisão final → release.

- [x] **Spec** `6d36922` — `docs/superpowers/specs/2026-06-05-copiloto-pagina-multimodo-design.md` (12 decisões D-1..D-12, arquitetura, 3 modos, a11y, inventário).
- [x] **Planos** `df55305` + ajustes `0a96013` — `docs/superpowers/plans/2026-06-05-copiloto-multimodo-A-core.md` e `…-B-surface.md`.
- [x] **Plano A (núcleo, 10 tarefas)** `73a9877`→`c839746` — fix PRD-044, `metricUi`, sugestões categorizadas, `runCopilotQuery` (puro), `sessionStore` (reducers), `sessionGrouping`, `useCopilotViewMode`, `useCopilotSessions`, `useCopilotChat`, barrel. Reparos de revisão `4c0b273` (bug de sessão ao excluir a última, teste honesto de escopo, limpezas).
- [x] **Plano B (superfície, 15 tarefas)** `27ffee4`→`01f31e2` — `answerFormatting`, `Sparkline`, `AnalyticsAnswerCard` turbinado, `CopilotComposer`, `CopilotEmptyState`, `CopilotConversation`, `CopilotViewSwitcher`, `CopilotHeader`, `CopilotSessionList`, `CopilotDetailPanel`, `AnalyticsCopilotPage`, rota+menu, gating na Sidebar, navegação na TopBar, **remoção do `Sheet` + hook antigo**.
- [x] **Fix a11y** `4512563` — um único `<h1>` por página (saudação do hero → `<p>`).
- [x] **Revisão final de integração** (agente) — veredito **PRONTO PARA PR**; só 2 Minor (h1 corrigido; threshold de sparkline benigno).
- [x] **Teste manual** — aprovado pelo usuário.
- [x] **Release v0.66.0 "Oracle"** `0fe6420` — bump `0.65.0→0.66.0`, `CHANGELOG.md` (Forecast PRD-056 + Copiloto PRD-057), `PRD-056`/`PRD-057` renomeados para `_DONE` com seção de status.
- [x] **PR #36 mergeado** na `main` `6f34f7e`; branch `feat/copiloto-pagina-multimodo` removida (local+remota).
- [x] **Tag `v0.66.0`** criada e pushada.
- [x] **Memória** `project-routetree-merge-block` salva (gotcha do `routeTree.gen.ts` no `gh pr merge`).
- [x] Verificado por mim (ground truth): **66 testes verdes**, **`bun run build` verde**, sem refs órfãs do Sheet, wiring rota/menu/barrel/TopBar OK.

## 🔧 Estado do código

- **Branch:** `main` (em sincronia com `origin/main` = `6f34f7e`). Não há branch de trabalho aberta (feature mergeada e deletada).
- **Versão:** `package.json` = **0.66.0**; tag **`v0.66.0`** no HEAD.
- **Build/testes:** PASS — `bun run build` verde; **66 testes** (14 arquivos) verdes (rodados nesta sessão).
- **PRs abertos relacionados:** nenhum (PR #36 mergeado). O PR #9 aberto (`claude/confident-stonebraker-c6d008`, "página em breve") é de outra frente, **não relacionado**.
- **Working tree:** `M src/routeTree.gen.ts` é **artefato gerado** (build/dev regenera) — NÃO commitar; descartar com `git checkout -- src/routeTree.gen.ts`. Untracked **pré-existentes, não desta sessão**: `docs/prds/PRD-026-gestao-midia.md`, `docs/prds/PRD-027-envio-rapido-biblioteca-ativos.md`, `docs/relatorio-codigo-morto-2026-06-04.md`, `knip.json` — **não commitar sem o usuário pedir**.

## ⏳ Pendências (próximos passos, em ordem)

> O epic do Copiloto/Forecast está **100% concluído e lançado**. Não há pendência bloqueante. As opções abaixo são trabalhos novos, à escolha do usuário.

1. **Próximo PRD da fila** (a definir com o usuário) — ver índice em `docs/prds/briefing-execucao-prds.md`. *Feito quando:* novo PRD escolhido e iniciado via brainstorming.
2. **Follow-ups opcionais do Copiloto (Fase 2):** NLU por LLM real (substituir resolver por regras), persistência de sessões em Supabase, renomear conversas. *Arquivos:* `src/features/analytics-copilot/engine/`, `hooks/`. *Não bloqueia.*
3. **Follow-ups opcionais do Forecast (Fase 2):** seletor de período (hoje fixo no mês atual), métrica de margem. *Arquivos:* `src/features/sales-forecast/`. *Não bloqueia.*
4. **Dívida técnica (opcional):** sanear os ~315 erros pré-existentes de `tsc --noEmit` na `main` (e o `triple-slash-reference` em `vitest.config.ts`). *Feito quando:* `tsc --noEmit` limpo sem quebrar `vite build`.

## ❓ Decisões pendentes

- Nenhuma desta sessão. (Versão = bump único v0.66.0 "Oracle"; fechamento foi feito dentro do PR #36 — ambas decididas pelo usuário e executadas.)

## 🚧 Bloqueios / Riscos

- Nenhum bloqueio. Risco operacional conhecido: `gh pr merge --delete-branch` trava o fast-forward local por causa do `routeTree.gen.ts` sujo (gerado) — descartar antes de mergear (ver memória `project-routetree-merge-block`). Aconteceu nos PR #35 e #36; recuperado com sucesso.

## ⚠️ Avisos do usuário (regras desta sessão)

- **Testa UI manualmente** — NÃO abrir browser/devtools/preview para validar (memória `feedback_manual_testing`). Pode sugerir `! bun run dev`.
- **Ignorar `.claude/worktrees/` e `.superpowers/`** — cópias isoladas; não explorar/editar/referenciar.
- **CRLF aparente é falso positivo** (autocrlf) — verificar via `git cat-file`; não rodar `prettier --write` em massa por isso (memória `project_git_autocrlf_subagents`).
- **Subagentes não trocam de branch.**
- **`tsc` global tem ~315 erros pré-existentes** — gate real é `bun run build` (memória `project_tsc_baseline_errors`).
- **Não commitar na `main` sem confirmação** (CLAUDE.md global).
- **Não commitar os untracked não relacionados** (PRD-026/027, knip.json, relatorio-codigo-morto) — não fazem parte do trabalho.
- **24h supply-chain guard** (`bunfig.toml minimumReleaseAge`) — confirmar antes de adicionar a `minimumReleaseAgeExcludes`.
- **Acentos pt-BR corretos** em todo conteúdo de usuário (UTF-8).

## 🛡️ Não regredir (features que devem continuar funcionando)

- **Copiloto Analítico** em `/app/gestao/copiloto` (menu Gestão → Copiloto): seletor **Foco/Histórico/Split** (persiste em localStorage), hero de sugestões por categoria, **answer card** (número herói, delta, sparkline quando há série, citação/drill-down, "perguntar de novo"), **histórico** de sessões (agrupado, excluir), **painel Split**, drawers no mobile. Entrada também pela TopBar (botão robô) e **Ctrl/Cmd+K** (ambos navegam). Gating por `analyticsCopilotEnabled` (Owner em Config esconde o item/botão).
- **RNF-001:** todo número vem de `runCopilotQuery → executeQuery → IAnalyticsDataAccess`; estados "não resolvido"/"recusado por escopo" nunca mostram número.
- **Forecast** em `/app/gestao/forecast` (3 cenários + breakdown + tabela por vendedor) + widget no cockpit.
- Todos os painéis de BI existentes (Vendas, Metas, ABC, Carteira, Rentabilidade, DRE, Positivação, Insights…) e o cockpit.
- `bun run build` verde; 66 testes verdes.

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `src/features/analytics-copilot/pages/AnalyticsCopilotPage.tsx` — montagem dos 3 modos (header + conversa + asas/drawers).
- `src/features/analytics-copilot/hooks/{useCopilotChat,useCopilotSessions,useCopilotViewMode}.ts` — orquestração + sessões (localStorage) + view-mode.
- `src/features/analytics-copilot/engine/{runCopilotQuery,sessionStore}.ts` — orquestração pura (RNF-001) + reducers de sessão (testados).
- `src/features/analytics-copilot/components/` — `CopilotConversation`, `CopilotEmptyState`, `CopilotComposer`, `CopilotViewSwitcher`, `CopilotHeader`, `CopilotSessionList`, `CopilotDetailPanel`, `AnalyticsAnswerCard`, `Sparkline`.
- `src/features/shell/config/{routes.ts,navigation.ts}` (rota+menu) e `components/{Sidebar.tsx,TopBar.tsx}` (gating+navegação).
- Spec/planos em `docs/superpowers/specs/` e `…/plans/` (2026-06-05-copiloto-*).
- `CHANGELOG.md` (entrada 0.66.0 Oracle) · `CLAUDE.md` (convenções).

## 🧠 Memórias relacionadas

- `project-routetree-merge-block` — `routeTree.gen.ts` gerado trava o ff do `gh pr merge`; descartar antes.
- `project_tsc_baseline_errors` — `tsc` global tem ~315 erros pré-existentes; gate = `vite build`.
- `feedback_manual_testing` — usuário testa UI manualmente; não abrir browser/preview.
- `project_git_autocrlf_subagents` — CRLF aparente é falso positivo; subagentes não trocam de branch.
- `project_goals_autostatus_bug` — `useGoalAutoStatusUpdate` usa `.items` (deveria `.data`); não corrigido (fora de escopo).

## 📊 Atividade recente (telemetria)

`.claude-metrics/annotations.jsonl` não verificado nesta sessão (telemetria não confirmada ativa).

## 📚 Referências

- PR (mergeado): https://github.com/edmilson-prog/gallo-basediesel/pull/36
- Tag: `v0.66.0` (Oracle)
- Spec: `docs/superpowers/specs/2026-06-05-copiloto-pagina-multimodo-design.md`
- Planos: `docs/superpowers/plans/2026-06-05-copiloto-multimodo-A-core.md`, `…-B-surface.md`
- PRDs concluídos: `docs/prds/PRD-056-forecast-fechamento_DONE.md`, `docs/prds/PRD-057-copiloto-analitico_DONE.md`
