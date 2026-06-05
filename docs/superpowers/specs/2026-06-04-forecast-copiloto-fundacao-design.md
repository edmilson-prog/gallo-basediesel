# Design — Fundação Forecast (PRD-056) + Copiloto Analítico (PRD-057)

> **Data:** 2026-06-04
> **Escopo desta empreitada:** **Fundação primeiro** — o núcleo puro e testável de ambos os PRDs.
> PRD-056 Fases 1-2 (tipos + motor `computeForecast` + hook `useForecast`) e PRD-057 Fases 1-2
> (tipos + catálogo de métricas + `resolveQuery` + `executeQuery` + clamp RBAC), todos com testes unitários.
> As **superfícies** (página, widget, integração nas Metas, painel de chat, telas de configuração) ficam para
> uma segunda empreitada, construídas sobre uma base já validada.
> **Codinomes:** Horizon (056) · Oracle (057).

---

## 1. Objetivo e justificativa do recorte

Os dois PRDs são **reuse-heavy** sobre features que **já existem** no projeto (Vendas/041, Metas/042,
Pipeline de leads/017, Cockpit/040, RBAC/006, ABC/045, Carteira/046, Rentabilidade/049, Positivação).
A maior fonte de risco não é a UI — é a **correção da matemática** (forecast determinístico sem dupla
contagem) e a **governança de dados** do copiloto (RNF-001: *o número nunca vem do modelo*). Por isso a
fundação isola e valida primeiro essas duas peças puras, antes de investir nas superfícies.

A ordem **056 → 057 é fixa**: o catálogo do copiloto declara a métrica `forecast`, cujo executor
reaproveita o `useForecast` do 056.

---

## 2. Decisões arquiteturais (ratificadas)

| # | Decisão | Escolha |
|---|---------|---------|
| D-1 | **Fórmula do cenário "provável"** (056 DP-3) | **Residual com prioridade do pipeline** — o run-rate só preenche o que o pipeline conhecido ainda não cobre. Zero dupla contagem por construção. |
| D-2 | **Rota da página de Forecast** (056 DP-5) | `/app/gestao/forecast` — consistente com o agrupamento de BI existente (`/app/gestao/vendas`, `/metas`, `/abc`, `/carteira-analitica`…). |
| D-3 | **Pesos default** (056 DP-1) | `temperatureWeights`: frio `0.1` · morno `0.4` · quente `0.75`; `scenarioFactors`: pessimista `0.85` · provável `1.0` · otimista `1.15`; `lowConfidenceMinDays`: `3`. |
| D-4 | **Modo de ponderação default** (056 DP-2) | `temperature` (sinal mais direto do SDR no MVP). `stage`/`hybrid` modelados e suportados pelo motor. |
| D-5 | **Métricas do forecast no MVP** (056 DP-4) | `revenue` + `tickets`. `margin` fica como extensão (o pipeline só tem `estimatedValue`, não margem). |
| D-6 | **Pureza do executor do copiloto** | `executeQuery` é determinístico sobre um **port** `IAnalyticsDataAccess` injetado. Nenhuma chamada a hook/fetch dentro da função. O número vem sempre do port (que liga aos motores de BI), nunca do resolver. |
| D-7 | **Mapeamento métrica → executor** | Cada `IMetricDefinition` declara qual método do port a executa (`dataAccessKey`). Adicionar métrica = adicionar a definição + (se nova) um método de port. (RNF-004) |
| D-8 | **Política de audit do copiloto** (057 DP-4) | Registrar métrica resolvida + escopo; **não** persistir o texto livre da pergunta. |
| D-9 | **Codinomes** (DP-6 de ambos) | Horizon (056), Oracle (057). Versionamento no bump da empreitada de superfície. |

Decisões de superfície (056 DP nenhum pendente relevante; 057 DP-2 ponto de acesso, DP-3 mini-visual)
ficam **fora desta fundação** e serão tratadas na empreitada de superfície.

---

## 3. Estrutura de arquivos

```
src/shared/types/
  forecast.ts                         # IForecast*, IForecastConfig, IForecastInput  (056)
  analytics-copilot.ts                # IMetric*, IAnalytics*, IAnalyticsDataAccess  (057)

src/features/sales-forecast/
  engine/
    computeForecast.ts                # função PURA (sem React, sem fetch, sem Date global)
    defaults.ts                       # DEFAULT_FORECAST_CONFIG (D-3/D-4)
    __tests__/computeForecast.test.ts
  hooks/
    useForecast.ts                    # F2 — deriva em runtime via providers (memoizado)
  index.ts                            # barrel

src/features/analytics-copilot/
  catalog/
    metricCatalog.ts                  # IMetricDefinition[] declarativo (8 métricas)
    __tests__/metricCatalog.test.ts
  engine/
    resolveQuery.ts                   # PURO — keyword/sinônimo + extração de período/marca/categoria
    scopeClamp.ts                     # PURO — clamp RBAC por papel
    executeQuery.ts                   # determinístico sobre IAnalyticsDataAccess
    __tests__/resolveQuery.test.ts
    __tests__/scopeClamp.test.ts
    __tests__/executeQuery.test.ts
  index.ts                            # barrel
```

Tipos novos vivem em `src/shared/types/` (mesma casa de `bi.ts`, `goals.ts`, `lead.ts`, `indicators.ts`).
Nenhuma entidade é persistida — forecast e respostas são **derivados em runtime**, no padrão de
`calculateGoalProgress`.

---

## 4. PRD-056 — Forecast de Fechamento

### 4.1 Tipos (`src/shared/types/forecast.ts`)

Reaproveitam `ID`, `ISO8601`, `Money` (`common.ts`); `GoalLevel`, `GoalMetric`, `IGoalPeriod` (`bi.ts`);
`GoalProgressStatus` (`goals.ts`); `ILead` (`lead.ts`). Zero `any`.

```ts
export type ForecastScenarioType = "pessimista" | "provavel" | "otimista";
export type ForecastMetric = Extract<GoalMetric, "revenue" | "tickets">; // MVP (D-5)
export type PipelineWeightingMode = "temperature" | "stage" | "hybrid";

export interface IForecastBreakdown {
  realized: Money;          // já fechado no período
  weightedPipeline: Money;  // Σ estimatedValue × peso
  runRateRemainder: Money;  // contribuição do ritmo APÓS a regra residual (D-1)
}

export interface IForecastScenario {
  type: ForecastScenarioType;
  projectedValue: Money;
  gapToTarget?: Money;       // target − projected; negativo = acima da meta; undefined sem meta
  gapPercent?: number;
  ordersNeeded?: number;     // quando metric = tickets ou derivável do ticket médio
  status: GoalProgressStatus;// reusa o semáforo de Metas (PRD-042)
  breakdown: IForecastBreakdown;
}

export interface IForecastScope {
  level: GoalLevel;          // "store" | "team" | "individual"
  targetId: ID;
  storeId: ID;
  sellerId?: ID;
}

export interface IForecast {
  scope: IForecastScope;
  metric: ForecastMetric;
  period: IGoalPeriod;
  realizedValue: Money;
  targetValue?: Money;
  scenarios: IForecastScenario[];     // pessimista, provavel, otimista
  daysElapsed: number;
  daysRemaining: number;
  totalDays: number;
  lowConfidence: boolean;
  computedAt: ISO8601;
}

export interface IForecastConfig {
  temperatureWeights: { frio: number; morno: number; quente: number };
  scenarioFactors: { pessimista: number; provavel: number; otimista: number };
  pipelineWeightingMode: PipelineWeightingMode;
  stageWeights?: Record<ID, number>;  // usado quando mode = "stage" | "hybrid"
  lowConfidenceMinDays: number;       // default 3
}

export interface IForecastInput {
  scope: IForecastScope;
  metric: ForecastMetric;
  period: IGoalPeriod;
  realizedValue: Money;
  avgTicket?: Money;                   // para ordersNeeded
  openLeads: ILead[];                  // pipeline aberto do escopo
  target?: { value: Money };          // da meta vigente (IGoal/IGoalProgress), se houver
  calendar: { daysElapsed: number; daysRemaining: number; totalDays: number };
}
```

### 4.2 Motor `computeForecast(input, config): IForecast` — PURO (RNF-002)

Sem React, sem fetch, sem `Date.now()` interno — o calendário entra por `input.calendar`. Passos:

1. **Pipeline ponderado** = `Σ (lead.estimatedValue ?? 0) × peso(lead)`, onde o peso depende de
   `config.pipelineWeightingMode`:
   - `"temperature"` → `temperatureWeights[lead.temperature]`
   - `"stage"` → `stageWeights[lead.stage.id]` (fallback `0` se ausente)
   - `"hybrid"` → média dos dois (documentar; `stage` ausente cai para só temperatura)
   - ⚠️ `ILead.estimatedValue` é a chave correta (não `value`).
2. **Run-rate bruto** = `(realizedValue / max(daysElapsed, 1)) × daysRemaining` (reaproveita o conceito de
   `IGoalProgress.projection`).
3. **Regra residual (D-1)** — sem dupla contagem:
   ```
   runRateContribution = max(0, runRateBruto − weightedPipeline)
   provavelBase        = realizedValue + weightedPipeline + runRateContribution
   ```
   O `runRateRemainder` do breakdown é exatamente `runRateContribution`.
4. **Cenários**:
   ```
   provavel.projectedValue   = provavelBase × scenarioFactors.provavel   (1.0)
   pessimista.projectedValue = provavelBase × scenarioFactors.pessimista (0.85)
   otimista.projectedValue   = provavelBase × scenarioFactors.otimista   (1.15)
   ```
   O `breakdown` de cada cenário escala cada parcela pelo mesmo fator (soma das parcelas = `projectedValue`).
5. **Gap por cenário** (quando `target` existe): `gapToTarget = target − projectedValue`;
   `gapPercent = gapToTarget / target`; `ordersNeeded = ceil(max(0, gapToTarget) / avgTicket)` quando
   `metric = tickets` ou `avgTicket` disponível. Sem meta → `gapToTarget`/`gapPercent`/`ordersNeeded` ficam
   `undefined` (RF-013) e o forecast ainda é retornado.
6. **Status (semáforo)** por cenário, derivado da relação projeção↔meta (regra a fixar no código, documentada):
   realizado já ≥ meta → `concluida`; projeção ≥ meta → `no_caminho`; gap até ~10% → `atencao`; acima → `atrasada`.
   Sem meta → `no_caminho` neutro (a UI trata como "sem meta"). Isso faz cenários e widget falarem a **mesma
   linguagem visual** das Metas.
7. **lowConfidence** = `daysElapsed < config.lowConfidenceMinDays`.

### 4.3 Hook `useForecast(filters)` — Fase 2

`filters`: `{ storeId; sellerId?; period; metric }`. Sem `sellerId` → forecast da loja; com → individual.
Agrega **insumos** (não soma de forecasts) e chama o motor:

- **Realizado / ticket médio**: `useSalesAnalytics` (`kpis.revenue.current`, `kpis.avgTicket.current`),
  filtrado pelo escopo/período.
- **Pipeline**: `useLeadsProvider().list({ storeId, sellerId })` → filtra leads abertos (não convertidos /
  não perdidos) do escopo → `openLeads`.
- **Meta vigente**: `useGoalsWithProgress({ storeId, sellerId, statuses: ["ativa"] })` → encontra a meta cujo
  `metric` e `period` batem → `target.value = goal.targetValue`. (Integração só leitura; **não** altera
  `calculateGoalProgress`.)
- **Calendário**: derivado de `period` + data atual (injetada, não global).
- **Memoização** (RNF-003) por `(scope, metric, period, hash dos insumos)`.
- **Consolidação de loja** = insumos agregados da loja. Nível `team` modelado, **não exibido**.

> O `useForecast` é a única peça da fundação que toca React. O motor permanece puro e é onde mora a
> matemática testável. O contrato `IForecastProvider` substituível por ML (Fase 2) é **documentado, não
> implementado** — o ponto de troca é o motor por trás do hook.

---

## 5. PRD-057 — Copiloto Analítico (núcleo)

### 5.1 Tipos (`src/shared/types/analytics-copilot.ts`)

Reaproveitam `GoalMetric`/`IndicatorMetric`, `IGoalPeriod`, `Division`, `Money`, `ABCClass` e o
`RoleName` do RBAC. Zero `any`.

```ts
export type MetricDimension = "vendedor" | "canal" | "categoria" | "marca" | "cliente" | "loja" | "tempo";
export type ComparisonMode = "previous_period" | "previous_year";

export interface IMetricSource { prd: string; panelRoute: string; label: string; }

export interface IMetricDefinition {
  id: string;                              // "faturamento"
  label: string;
  description: string;
  metricKey: string;                       // alinhado a GoalMetric/IndicatorMetric
  dimensions: MetricDimension[];
  supportedFilters: MetricDimension[];
  keywords: string[];                      // sinônimos p/ o resolver mock
  source: IMetricSource;                   // citação + drill-down
  requiredRole?: RoleName;                 // escopo mínimo
  dataAccessKey: keyof IAnalyticsDataAccess; // D-7 — mapeia para o método do port
}

export interface IMetricQueryScope { storeId?: ID; sellerId?: ID; role: RoleName; }

export interface IMetricQuery {
  metricId: string;
  dimensions: MetricDimension[];
  filters: Partial<Record<MetricDimension, string>>; // { marca: "Volvo", categoria: "filtros" }
  period: IGoalPeriod;
  comparison?: ComparisonMode;
  scope?: IMetricQueryScope;               // preenchido pelo clamp
}

export interface IAnalyticsCitation { source: IMetricSource; drillDownUrl: string; }
export interface IAnalyticsComparison { previousValue: number; delta: number; deltaPercent: number; }
export type AnalyticsVisualType = "none" | "sparkline" | "number";

export interface IAnalyticsAnswer {
  query?: IMetricQuery;                     // ausente quando não resolvida
  resolved: boolean;
  value?: number | number[];
  formattedValue?: string;                  // pt-BR ("R$ 84.320")
  comparison?: IAnalyticsComparison;
  citation?: IAnalyticsCitation;
  visual?: AnalyticsVisualType;
  refusedByScope?: boolean;                 // RF-013
  ambiguous?: boolean;                      // RF-011
  suggestions?: string[];                   // perguntas próximas quando não resolvida/ambígua
}

export interface IAnalyticsMessage {
  id: ID; role: "user" | "assistant"; text?: string;
  answer?: IAnalyticsAnswer; timestamp: ISO8601;
}
export interface IAnalyticsSession { id: ID; messages: IAnalyticsMessage[]; }

// Port determinístico — a ÚNICA dependência do executor (D-6). Métodos retornam o número já calculado
// pelos motores de BI. Em testes, um stub devolve valores canônicos.
export interface IAnalyticsDataAccess {
  getSalesMetric(q: IMetricQuery): Promise<{ value: number; previousValue?: number; series?: number[] }>;
  getMargin(q: IMetricQuery): Promise<{ value: number; previousValue?: number }>;
  getPositivation(q: IMetricQuery): Promise<{ value: number; previousValue?: number }>;
  getABCClass(q: IMetricQuery): Promise<{ value: number; series?: number[] }>;
  getPortfolioStatus(q: IMetricQuery): Promise<{ value: number }>;
  getForecast(q: IMetricQuery): Promise<{ value: number }>; // reusa useForecast (056)
}
```

> O port é o **seam** que mantém `executeQuery` puro/testável. O adapter real (que liga cada método aos
> hooks/motores: `useSalesAnalytics`, `useProfitabilityData`, `usePositivationMetrics`,
> `useABCClassification`, `usePortfolioMetrics`, `useForecast`) é um pedaço **fino** — montado na empreitada
> de superfície. Na fundação, o port é exercitado por stubs nos testes.

### 5.2 Catálogo (`catalog/metricCatalog.ts`) — Fase 1

`metricCatalog: IMetricDefinition[]` declarativo cobrindo as 8 métricas do RF-006:

| id | metricKey | fonte (PRD · rota) | dimensões-chave |
|----|-----------|--------------------|-----------------|
| `faturamento` | revenue | PRD-041 · `/app/gestao/vendas` | marca, categoria, canal, vendedor, tempo |
| `margem` | margin | PRD-049 · `/app/gestao/rentabilidade` | categoria, cliente, vendedor, tempo |
| `pedidos` | tickets | PRD-041 · `/app/gestao/vendas` | vendedor, canal, tempo |
| `ticket_medio` | ticket_medio | PRD-041 · `/app/gestao/vendas` | vendedor, tempo |
| `positivacao` | positivacao | PRD (positivação) · `/app/gestao/positivacao` | vendedor, tempo |
| `curva_abc` | abc | PRD-045 · `/app/gestao/abc` | cliente, tempo |
| `carteira` | carteira | PRD-046 · `/app/gestao/carteira-analitica` | vendedor, cliente |
| `forecast` | forecast | PRD-056 · `/app/gestao/forecast` | loja, vendedor, tempo |

Cada definição com `keywords`/`synonyms` (ex.: faturamento → "faturei", "vendi", "receita", "faturamento"),
`source` e `dataAccessKey`. **Invariante testada:** toda métrica tem `source` (prd + rota + label) e ≥1 keyword.

### 5.3 Resolver `resolveQuery(question, context, catalog): IMetricQuery | null` — Fase 2, PURO

- Matching por keyword/sinônimo do catálogo → escolhe `metricId`.
- Extração simples de **período** ("esse mês", "mês passado" → `comparison: previous_period`), **marca** e
  **categoria** reusando `part-identification/data/brands.ts` (reconhece "Volvo", "Scania", etc.) e a lista de
  categorias de peças.
- **Ambiguidade** (mapeia a >1 métrica): retorna query parcial com `ambiguous: true` → a UI pede
  desambiguação (RF-011). Nunca adivinha.
- **Fora do catálogo**: retorna `null` → `executeQuery` não é chamado; resposta honesta + sugestões (RF-016).

### 5.4 Clamp `scopeClamp(query, scope): IMetricQuery` — Fase 2, PURO

Aplica o escopo do papel **antes** de executar (PRD-006):
- **Vendedor** → força `sellerId` = ele; bloqueia dimensão `vendedor` cruzada com colegas → se a pergunta
  pede dado de outro vendedor, marca `refusedByScope` (RF-013).
- **Gestor** → restringe à loja; **Owner** → cross-store; **Financeiro** → conforme PRD-006.

### 5.5 Executor `executeQuery(query, dataAccess): IAnalyticsAnswer` — Fase 2, determinístico (D-6)

- Despacha para o método do port indicado por `definition.dataAccessKey`, passando a query **já clampada**.
- Monta `formattedValue` (pt-BR), `comparison` (quando `query.comparison`), `citation`
  (`source` + `drillDownUrl` com os filtros aplicados) e `visual`.
- **RNF-001 (inegociável):** o número vem **só** do port. O resolver/LLM apenas escolheu métrica/filtros.
- Se `refusedByScope` → resposta de recusa transparente, sem número, marcada para audit.

### 5.6 Provider (contrato) — documentado nesta fase, montado na superfície

`IAnalyticsCopilotProvider.ask(question, context): Promise<IAnalyticsAnswer>` orquestra
`resolveQuery → scopeClamp → executeQuery`. Mock na Fase 1 via `useDataProviderSlice` (padrão dos demais
providers). A impl LLM (Fase 2 / PRD-151) **substitui apenas o resolver**, mantendo clamp + executor +
provider + UI intactos (RNF-008). O contrato fica declarado nos tipos; a implementação concreta entra com a
superfície.

---

## 6. Estratégia de testes (fundação)

| Alvo | Casos |
|------|-------|
| `computeForecast` | com/sem meta · com/sem pipeline · 3 modos de ponderação · regra residual (pipeline ≥ run-rate e pipeline < run-rate) · low-confidence · `ordersNeeded` · soma do breakdown = `projectedValue` por cenário |
| `metricCatalog` | toda métrica tem `source` completa + ≥1 keyword · `dataAccessKey` válido |
| `resolveQuery` | resolve correto (faturamento de filtro Volvo) · `null` fora do catálogo · ambiguidade (`ambiguous`) · extração de período/marca/categoria |
| `scopeClamp` | Vendedor força `sellerId` e recusa colega · Gestor restringe loja · Owner cross-store |
| `executeQuery` | usa o método de port certo com filtros clampados · monta citation/comparison · **nunca** produz o valor (verificado via stub) · recusa por escopo sem número |

Sem suite configurada hoje; o type-check via `bun run build` (`tsc --noEmit`) é a rede mínima. A fundação
**introduz** testes unitários para o núcleo puro — decisão a confirmar no plano: adotar Vitest (alinhado a
Vite) como runner.

---

## 7. Orquestração (workflows)

- **Núcleo tipado em sequência/in-context.** 056 antes de 057 (dependência dura via `useForecast`). Tipos
  compartilhados e providers são tocados aqui — fan-out paralelo mutando os mesmos arquivos geraria conflito.
- **Workflow para fan-out de folhas independentes:** as ~8 definições de `IMetricDefinition` do catálogo
  podem ser geradas/revisadas em paralelo depois que os tipos estiverem congelados.
- **Workflow para o passe de verificação final (adversarial):** type-check + pureza dos motores
  (sem React/fetch/Date global) + a checagem de governança "o número nunca vem do modelo" (RNF-001) +
  cobertura dos critérios de aceitação dos PRDs.

---

## 8. Guia de design para as superfícies (preservado para a 2ª empreitada)

Capturado do especialista de UI/UX, ancorado nos componentes reais — **referência ao construir as telas**:

- **Reutilizar, não recriar:** `GoalStatusBadge`/`GoalProgressBar` (semáforo emerald/amber/red),
  `TrendBadge`/`Sparkline` do `ExecutiveKpiCard` (delta e mini-visual), `TypingIndicator` e `bubbleChrome` de
  `conversations` (chat), `Sheet` (painel), `Card` com header padrão, `EmptyState`.
- **Forecast:** 3 `<ForecastScenarioCard>` em `grid-cols-1 md:grid-cols-3` (provável com
  `border-primary/50 ring-1 ring-primary/20`); **breakdown como barra CSS empilhada** (realizado `bg-primary`
  → pipeline `bg-primary/45` → run-rate tracejado `bg-muted-foreground/30`) + legenda-tabela textual (a11y);
  banner amber de baixa confiança; `<ForecastWidget>` no cockpit que **falha isolado**; tabela por vendedor
  ordenada por maior gap; no mobile, reflow vertical na ordem **Provável → Pessimista → Otimista**.
- **Copiloto:** `Sheet` lateral (`lg:max-w-lg`, full-screen no mobile via `w-full`); `<AnalyticsAnswerCard>`
  com valor em destaque (`text-2xl`) + `TrendBadge` + **citação obrigatória clicável** (selo "verificável"
  `mdi:check-decagram-outline`); botão global na TopBar entre `ThemeSwitcher` e `NotificationDropdown`
  (atalho que **não** colida com o `/` do `GlobalSearch`); região de chat `role="log" aria-live="polite"`;
  card honesto "ainda não sei responder isso" + chips de sugestão; **nunca** renderiza número quando
  `resolved: false` ou `refusedByScope`.
- **Acessibilidade (WCAG AA):** cor nunca é o único sinal (nome do cenário + badge com ícone/rótulo);
  barra empilhada com `role="img"` + `aria-label`; foco no input ao abrir o painel; teclado navegável.
- **Confiança:** breakdown sempre visível (Forecast) e citação sempre visível (Copiloto) — número sem origem
  não gera confiança.

Arquivos-âncora: `goals/components/GoalStatusBadge.tsx`, `GoalProgressBar.tsx`, `goals/utils/labels.ts`,
`executive-cockpit/components/ExecutiveKpiCard.tsx`, `ComparativoCard.tsx`,
`charts/RevenueOrdersComposedChart.tsx`, `goals/components/widget/GoalsWidget.tsx`,
`goals/components/detail/GoalCompositionSection.tsx`, `components/ui/sheet.tsx`, `scroll-area.tsx`,
`shell/components/TopBar.tsx`, `conversations/components/TypingIndicator.tsx`,
`conversations/components/bubbles/bubbleChrome.tsx`, `styles.css`, `config/themes.ts`.

---

## 9. Fora de escopo (esta fundação)

- Páginas, widget, integração nas Metas, painel de chat, telas de configuração e RBAC nas rotas
  (empreitada de superfície).
- Implementação concreta do `IAnalyticsCopilotProvider` e do adapter real do `IAnalyticsDataAccess`
  (só contrato + stubs aqui).
- ML/LLM real (Fase 2, atrás dos contratos `IForecastProvider`/resolver LLM).
- Forecast por SKU/categoria, multi-período, narrativa em linguagem natural; text-to-SQL; persistência de
  sessões/snapshots — todos Fase 2 ou fora dos PRDs.
- Bump de versão e CHANGELOG (acontecem ao fechar a empreitada de superfície, quando os PRDs viram `_DONE`).

---

## 10. Critérios de pronto (fundação)

- [ ] `forecast.ts` e `analytics-copilot.ts` compilam com `tsc --noEmit`, zero `any`.
- [ ] `computeForecast` puro, passando todos os casos de teste (incl. regra residual D-1).
- [ ] `useForecast` agrega insumos e memoiza, sem alterar `calculateGoalProgress`.
- [ ] `metricCatalog` com 8 métricas válidas (invariante testada).
- [ ] `resolveQuery` + `scopeClamp` + `executeQuery` puros/determinísticos, com testes verdes.
- [ ] Verificado: o valor numérico **nunca** sai do resolver — só do port (RNF-001).
- [ ] Contratos `IForecastProvider`/`IAnalyticsCopilotProvider` documentados para a Fase 2.
```
