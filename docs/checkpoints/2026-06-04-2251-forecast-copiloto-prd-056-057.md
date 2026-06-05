# Checkpoint — Forecast (PRD-056) + Copiloto Analítico (PRD-057) — 2026-06-04T22:51:05-0300

> **Branch:** `main` · **Último commit:** `7936ff1` Merge pull request #35
> **Sessão anterior:** Claude Opus 4.8 (1M context) · **Gerado em:** 2026-06-04T22:51:05-0300

---

## 🎯 Como retomar (cole isto na nova sessão)

```
Leia o arquivo `docs/checkpoints/2026-06-04-2251-forecast-copiloto-prd-056-057.md` na íntegra
e confirme em uma frase que entendeu: 1) o objetivo da sessão, 2) o estado atual do código,
3) qual é a próxima tarefa. Não faça nenhuma ação até eu autorizar.
```

---

## 📌 Contexto do projeto

GALLO BASE DIESEL — SaaS de inteligência comercial para distribuidora de peças pesadas (Volvo/Scania/Mercedes/Ford Cargo/Iveco). SPA React 19 + TS strict + Vite + TanStack Router (file-based) + TanStack Query + Tailwind v4 + shadcn/ui, feature-based em `src/features/`. Dados via **provider pattern** (`useDataProviderSlice`, mock|supabase por `VITE_DATA_SOURCE`). Desenvolvimento dirigido por PRDs em `docs/prds/`. Esta sessão implementou os PRD-056 (Forecast) e PRD-057 (Copiloto Analítico) **completos** — núcleo puro + superfície de UI.

## 🎯 Objetivo da sessão

Implementar do zero os PRD-056 e PRD-057. Começou pela **fundação** (núcleo puro/testável) e, a pedido do usuário ("implemente o restante que falta", após notar que o Forecast não aparecia no menu), seguiu para a **superfície** (páginas, widget, painel de chat, rotas, menu, configs). Tudo mergeado na `main` via PR #35.

## ✅ Progresso (o que foi feito)

**Fundação (núcleo puro) — mergeado:**
- [x] Vitest (node env) + config, commit `4075c4d`.
- [x] PRD-056 tipos (`src/shared/types/forecast.ts`) `3fcefc0`; motor `computeForecast` (regra residual, 3 cenários) `4ec4436`; `buildForecastInput` `630a749`; hook `useForecast` `c5937f8`.
- [x] PRD-057 tipos + port `IAnalyticsDataAccess` (`src/shared/types/analytics-copilot.ts`) `bdbf4a8`; catálogo de 8 métricas `3fe456a`; `resolveQuery` `5d2d453`; `scopeClamp` `174f2d9`; `executeQuery` `e00e076`; barrel `1d199af`; fix formatação `c832552`.

**Superfície PRD-056 (Forecast) — mergeado:**
- [x] `forecast?` em `IPlatformSettings` `990a99d`; hook `useStoreForecast` (carga única, store + por vendedor) `d205ada`.
- [x] `ForecastScenarioCard`+`ForecastBreakdown` `8457f5c`; `ForecastSellersTable` `7c83cc6`; `ForecastWidget` `ae1750b`; `SalesForecastPage` `004e35c`.
- [x] Rota `/app/gestao/forecast` + **item "Forecast" no menu Gestão** `8ffd60d`; widget montado no cockpit `05c1a48`; `ForecastConfigPage` (Owner) + rota `a8cf4ac`.

**Superfície PRD-057 (Copiloto) — mergeado:**
- [x] `analyticsCopilotEnabled` setting `f4b6bff`; adapter `useAnalyticsDataAccess` (providers + funções puras) `4c9d3da`; orquestração `useAnalyticsCopilot` `2222d6b`.
- [x] `AnalyticsAnswerCard`+suggestions `954787b`; painel `AnalyticsCopilotPanel` (Sheet) `55122e3`; **botão TopBar + Ctrl+K** `1f0e3e1`; `AnalyticsCopilotConfigPage` (Owner) + rota `59ac4e5`.

**Entrega:**
- [x] PR #35 criado, atualizado e **MERGEADO** na `main` (`7936ff1`). Branch `feat/prd-056-057-foundation` deletada (local + remota).
- [x] Verificado por mim: `bun run test` = **35 testes** (6 arquivos) + `bunx vitest run src/features/analytics-copilot` = **21 testes**; `bun run build` (vite, gate real) **verde** (~16s); eslint limpo nas features.
- [x] Memória salva: `project-tsc-baseline-errors` (tsc global tem ~315 erros pré-existentes; gate real = `vite build`).
- [x] Docs versionados: spec `docs/superpowers/specs/2026-06-04-forecast-copiloto-fundacao-design.md`; planos `docs/superpowers/plans/2026-06-04-forecast-copiloto-fundacao.md`, `…-forecast-surface.md`, `…-copilot-surface.md`.

## 🔧 Estado do código

- **Branch:** `main` (em sincronia com `origin/main`, `7936ff1`). **Não há branch de trabalho aberta** (a feature foi mergeada e deletada).
- **Build/testes:** PASS — `vite build` verde; 35+21 testes verdes (rodados nesta sessão).
- **PRs abertos relacionados:** nenhum (PR #35 já mergeado). (O PR #9 aberto é de outra branch, não relacionado.)
- **Working tree:** `M src/routeTree.gen.ts` é **artefato gerado** (o `vite build`/dev regenera) — NÃO commitar; descartar com `git checkout -- src/routeTree.gen.ts` se incomodar. Untracked (`docs/prds/PRD-026/027/056/057.md`, `knip.json`, `docs/relatorio-codigo-morto-2026-06-04.md`) são **pré-existentes**, não são desta sessão.

## ⏳ Pendências (próximos passos, em ordem) — "fechamento dos PRDs"

1. **Fix de citação (trivial):** em `src/features/analytics-copilot/catalog/metricCatalog.ts:57`, trocar `prd: "PRD-043"` → `prd: "PRD-044"` na métrica `positivacao`. *Por quê:* PRD-043 é ranking/gamificação; positivação é `docs/prds/PRD-044-positivacao_DONE.md`. *Feito quando:* o `source.prd` da positivação for `PRD-044` e `bun run build` continuar verde. Sem impacto funcional (rota/label já corretos; teste valida só o formato `PRD-\d+`).
2. **Bump de versão (SemVer):** versão atual `v0.65.0 "Fitment"` (ver `package.json` + rodapé do app). Bump MINOR com codinome. *Decisão pendente abaixo (um bump vs dois).* *Feito quando:* `package.json` version atualizado + tag git `vX.Y.0`.
3. **CHANGELOG.md** (Keep a Changelog): seção nova com **Added** — Forecast de Fechamento (PRD-056) e Copiloto Analítico (PRD-057). *Feito quando:* entrada com data + codinome + itens.
4. **Renomear PRDs para `_DONE`:** `docs/prds/PRD-056-forecast-fechamento.md` → `…_DONE.md` e `PRD-057-copiloto-analitico.md` → `…_DONE.md`, preenchendo a seção "Status de Implementação" (Status ✅, data, versão). *Obs:* esses arquivos estão **untracked** hoje — renomear + `git add`.
5. **Follow-ups opcionais (não bloqueiam):** Forecast com seletor de período (hoje fixo no mês atual) + métrica de margem; CTA do copiloto no cockpit; saneamento dos ~315 erros pré-existentes de `tsc` (dívida da `main`).

> Como as pendências 1-4 são commits diretos, **decidir antes**: fazer **direto na `main`** ou via **branch curta `chore/release-…` + PR** (ver decisões pendentes).

## ❓ Decisões pendentes

- **Quantos bumps de versão?**
  - Opção A — **um bump único** (junta os dois PRDs), codinome sugerido **Oracle**. Prós: simples, 1 release. Contra: mistura dois épicos.
  - Opção B — **dois bumps** (`Horizon` p/ 056, depois `Oracle` p/ 057). Prós: rastreabilidade por PRD. Contra: mais cerimônia.
  - Inclinação atual: A (um bump "Oracle"), mas o usuário decide.
- **Onde commitar o fechamento (pendências 1-4)?**
  - Opção A — **direto na `main`** (rápido; viola levemente a regra "não commitar na main sem confirmação", mas com OK explícito é ok).
  - Opção B — **branch `chore/release-oracle` + PR** (consistente com o fluxo do PR #35).
  - Inclinação atual: B (branch + PR), pela consistência.

## 🚧 Bloqueios / Riscos

- Nenhum bloqueio. Risco menor: `tsc --noEmit` global nunca fica limpo (dívida pré-existente) — **não usar como gate**; usar `bun run build`.

## ⚠️ Avisos do usuário (regras desta sessão)

- **Testa UI manualmente** — NÃO abrir browser/devtools/preview para validar (memória `feedback_manual_testing`). Pode sugerir `! bun run dev`.
- **Ignorar `.claude/worktrees/` e `.superpowers/`** — cópias isoladas de outras branches; não explorar/editar/referenciar.
- **CRLF aparente é falso positivo** (autocrlf) — verificar via `git cat-file`; não rodar `prettier --write` em massa por causa disso (memória `project_git_autocrlf_subagents`).
- **Subagentes não trocam de branch.**
- **`tsc` global tem ~315 erros pré-existentes** — gate real é `vite build` (memória `project-tsc-baseline-errors`).
- **Não commitar na `main` sem confirmação** (CLAUDE.md global).

## 🛡️ Não regredir (features que devem continuar funcionando)

- **Forecast no menu** (Gestão → Forecast), página `/app/gestao/forecast` (3 cenários + breakdown + tabela por vendedor), **widget no cockpit** (falha isolada), config Owner.
- **Copiloto** acessível pela TopBar (ícone robô) + **Ctrl+K**, painel de chat com citação obrigatória; **RNF-001**: o número vem só do adapter/funções puras, nunca do resolver.
- Todos os painéis de BI existentes (Vendas, Metas, ABC, Carteira, Rentabilidade, DRE, Positivação, Insights…) e o cockpit.
- `bun run build` verde; 35+21 testes verdes.

## 📂 Arquivos-chave (ler primeiro na nova sessão)

- `src/features/analytics-copilot/catalog/metricCatalog.ts` — **linha 57** é o fix do PRD-044.
- `package.json` (version) e `CHANGELOG.md` — para o bump/changelog.
- `docs/prds/PRD-056-forecast-fechamento.md` / `PRD-057-copiloto-analitico.md` — renomear para `_DONE` + seção de status.
- `src/features/sales-forecast/` (núcleo: `engine/`, `hooks/useForecast.ts`, `hooks/useStoreForecast.ts`; superfície: `components/`, `pages/`).
- `src/features/analytics-copilot/` (adapter `adapters/useAnalyticsDataAccess.ts`, hook `hooks/useAnalyticsCopilot.ts`, `components/AnalyticsCopilotPanel.tsx`).
- `src/features/shell/components/TopBar.tsx` (botão + Ctrl+K), `src/features/shell/config/navigation.ts` (item Forecast).
- Spec/planos em `docs/superpowers/` (decisões + guia de design §8).
- `CLAUDE.md` — convenções.

## 🧠 Memórias relacionadas

- `project-tsc-baseline-errors` — `tsc` global tem ~315 erros pré-existentes; gate = `vite build`.
- `feedback_manual_testing` — usuário testa UI manualmente; não abrir browser/preview.
- `project_git_autocrlf_subagents` — CRLF aparente é falso positivo; subagentes não trocam de branch.
- `project_goals_autostatus_bug` — `useGoalAutoStatusUpdate` usa `.items` (deveria `.data`); não corrigido (fora de escopo).

## 📊 Atividade recente (telemetria)

`.claude-metrics/annotations.jsonl` não verificado nesta sessão (telemetria não confirmada ativa).

## 📚 Referências

- PR (mergeado): https://github.com/edmilson-prog/gallo-basediesel/pull/35
- Spec: `docs/superpowers/specs/2026-06-04-forecast-copiloto-fundacao-design.md`
- Planos: `docs/superpowers/plans/2026-06-04-forecast-copiloto-fundacao.md`, `…-forecast-surface.md`, `…-copilot-surface.md`
- PRDs-fonte: `docs/prds/PRD-056-forecast-fechamento.md`, `docs/prds/PRD-057-copiloto-analitico.md`
