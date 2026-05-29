# Design — Metas em lote (planejamento anual)

**Data:** 2026-05-28
**Feature:** `goals`
**Rota alvo:** `/app/gestao/metas/lote` (nova)
**Depende de:** fix de roteamento de metas (layout + `<Outlet/>`) — branch `fix/metas-nested-routes` / PR #5
**Status:** Aprovado (brainstorming) — pronto para plano de implementação

---

## 1. Objetivo

Permitir que Owner/Gestor criem metas **individuais por vendedor**, **mês a mês ao
longo de um ano**, numa única tela — em vez de cadastrar cada meta separadamente. O
usuário edita **um mês por vez** (sem ver os 12 simultaneamente) e acompanha o **total
anual** de cada vendedor enquanto preenche.

## 2. Ponto de entrada e rota

- Botão **"Meta em lote"** (ícone `mdi:account-multiple-plus`) no header do
  `AggregatedGoalsDashboard`, ao lado de "Nova meta", visível quando `canCreate`
  (Owner/Gestor).
- Nova rota **`/app/gestao/metas/lote`** → página `BatchGoalsPage`, com
  `requireAuth(["Owner", "Gestor"])`. Renderiza sob o layout/Outlet de metas (corrigido
  no PR #5).

## 3. UI

### 3.1 Parâmetros compartilhados (topo, definidos uma vez)

- **Loja** — Owner seleciona (dirige a lista de vendedores); Gestor travado na sua loja.
- **Métrica** — mesmas opções de `NewGoalPage` (`PRIMARY_GOAL_METRICS` +
  `SECONDARY_GOAL_METRICS`).
- **Ano** — ano-calendário (default: ano corrente). Cada mês preenchido vira uma meta
  **mensal** (`period.type: "monthly"`).
- **Recompensa** — texto opcional, compartilhado por todas as metas criadas.

### 3.2 Navegação por mês

- Abas **Jan–Dez** (segmentadas). Edita-se **um mês por vez**; trocar de aba **preserva**
  os valores digitados. Inicia no mês corrente.
- Cada aba mostra um **ponto** (dot) verde quando há ao menos um valor preenchido naquele
  mês — visão de progresso do ano sem abrir os 12.

### 3.3 Tabela de vendedores (do mês selecionado)

Uma linha por **vendedor ativo** da loja. Colunas:

- **checkbox** (incluir/excluir o vendedor do lote)
- **Vendedor** (avatar + nome — usar `fullName`)
- **Meta de `<mês>`** — input monetário editável, valor daquele mês
- **Sugestão** — valor sugerido por vendedor (via `suggestTarget`), clicável → aplica no
  **mês atual**
- **Total anual** — soma dos 12 meses + indicador `X/12 meses`
- **Status (mês)** — `✓ será criada` (valor preenchido), `vazio — ignorado` (sem valor),
  ou `⚠ já tem meta em <mês>` (conflito; ver 3.5)

### 3.4 Barra de ações (escopo enxuto)

- Seletor **"Aplicar em: [Este mês] [Ano todo]"** (segmentado; default "Este mês").
- **"Aplicar valor-base"** — preenche o valor-base nos vendedores selecionados, no escopo
  escolhido (mês atual ou os 12 meses).
- **"✨ Sugerir"** — preenche com a sugestão de cada vendedor, no escopo escolhido.
- Ambas as ações **respeitam conflitos** (não sobrescrevem meses em conflito) e o
  conjunto de vendedores marcados.

### 3.5 Conflito (por mês)

- Para cada (vendedor, mês), detectar se já existe meta **ativa** do mesmo
  `metric`+`level: individual`+`targetId` com **período sobreposto** àquele mês — reusando
  a lógica de sobreposição de `validateGoalDraft` / `findDuplicateGoal`.
- Célula/linha em conflito **naquele mês**: badge âmbar "já tem meta em `<mês>`", input e
  checkbox daquele mês desabilitados, **excluída da criação**. Outros meses do mesmo
  vendedor seguem normais.

### 3.6 Rodapé

- Resumo dinâmico: **"N metas mensais serão criadas · M puladas por conflito · total anual
  R$…"** (N = vendedores marcados × meses preenchidos, exceto conflitos).
- **"Criar N metas do ano"** (status `ativa`) + **"Salvar rascunho"** (status `arquivada`),
  espelhando `NewGoalPage`. Desabilita criar quando N = 0.

## 4. Dados e lógica

### 4.1 Modelo

Cada **célula preenchida (vendedor × mês)** = **um `IGoal`**:

- `level: "individual"`, `targetId/sellerId` = vendedor, `storeId`
- `period: { type: "monthly", start: <início do mês>, end: <fim do mês> }` no ano escolhido
- `metric`, `targetValue` = valor da célula, `rewardDescription` (compartilhada)
- `division: "parts"`, `name` autogerado (`generateName(metric, "monthly", start)`),
  `status` `ativa`|`arquivada`, `createdBy`, timestamps, `currentValue: 0`,
  `progressPercent: 0`.

### 4.2 Criação

- Loop: para cada (vendedor marcado, mês preenchido, sem conflito) → montar draft,
  validar com `validateGoalDraft`, `goalsProvider.upsert(goal)`, `recordAuditLogSync`
  (`action: "goal_create"`). **Não** é necessário novo método de provider (reusa `upsert`
  em laço — YAGNI; mock e Supabase futuros suportam).
- **Sucesso parcial:** se um upsert falhar, continuar os demais; ao final, toast com
  `X criadas, Y puladas/erro` e navegar para `/app/gestao/metas`.

### 4.3 Sugestão

- `suggestTarget({ metric, level: "individual", storeId, sellerId, allGoals })` por
  vendedor → valor mensal sugerido. Reusar o engine existente.

### 4.4 Conflitos / metas existentes

- Carregar metas ativas da loja via `useGoalsWithProgress({ storeId, statuses: ["ativa"] })`
  e indexar por (sellerId, metric) para checar sobreposição mês a mês.

## 5. Arquitetura / arquivos

- **Create** `src/routes/app.gestao.metas.lote.tsx` — rota (guard Owner/Gestor) → `BatchGoalsPage`.
- **Create** `src/features/goals/pages/BatchGoalsPage.tsx` — composição da tela (params,
  abas de mês, tabela, ações, rodapé).
- **Create** `src/features/goals/hooks/useBatchGoals.ts` — estado e regras puras o quanto
  possível: matriz `value[sellerId][month]`, seleção, escopo, detecção de conflito por mês,
  contadores derivados (N a criar, M conflitos, total anual), e `buildGoalsToCreate()`.
- **Create** `src/features/goals/utils/batchGoals.ts` — helpers puros: `monthRange(year, month)`
  (início/fim ISO), `detectMonthConflict(...)` (reusa a sobreposição de `composition`/
  `validation`), `buildMonthlyGoalDraft(...)`. Testável isolado.
- **Modify** `src/features/goals/components/AggregatedGoalsDashboard.tsx` — botão "Meta em
  lote".
- **Modify** `src/features/goals/i18n/pt-BR.ts` — strings da feature.
- Reuso: `suggestTarget`, `validateGoalDraft`/`findDuplicateGoal`, `generateName`,
  `useGoalsWithProgress`, `useSellersProvider`, `useGoalsProvider`, `recordAuditLogSync`,
  `useCurrentStore`/`useAccessibleStores`, `useAuth`.

## 6. Fora de escopo (YAGNI)

- **Defaults/parâmetros padrão em Configurações** — feature seguinte (spec próprio).
- Crescimento automático (% ao mês), rateio de um total, metas de **loja/equipe** em lote.
- Edição em lote de metas já existentes (apenas criação).
- Persistência de rascunho de planejamento entre sessões (o "Salvar rascunho" cria metas
  com status `arquivada`, não salva o estado da tela).

## 7. Riscos / atenção

- **Volume:** até 12 × N metas criadas num clique — usar laço sequencial com toast de
  progresso/resultado; sem novo endpoint.
- **Conflitos parciais:** um vendedor pode ter conflito em alguns meses e não em outros —
  a detecção é por (vendedor, mês), não por vendedor.
- **Fuso/limites de mês:** `monthRange` deve usar início (dia 1, 00:00) e fim (último dia,
  23:59:59.999) locais convertidos para ISO, consistente com `NewGoalPage`.
- **RBAC:** Gestor travado na própria loja; Vendedor não acessa a rota.
- **Type-check:** verificação por `bunx tsc --noEmit` (projeto não tem runner de testes;
  `bun run build` é só `vite build`). Util de `batchGoals` é puro e pode ter checagem manual.
