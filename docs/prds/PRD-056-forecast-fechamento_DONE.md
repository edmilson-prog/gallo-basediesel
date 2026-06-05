# PRD-056: Forecast de Fechamento

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                                                                    |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                                                                                         |
| **Objetivo**          | Projetar o resultado provável de fechamento do período (faturamento, margem, tickets) a partir do realizado + pipeline ponderado + ritmo da meta, em três cenários (pessimista / provável / otimista), com gap-to-meta e drill-down — funcional já na Fase 1 por projeção determinística, preparado para ML na Fase 2 |
| **Tipo**              | Feature                                                                                                                                                                                                                                                                                                     |
| **Complexidade**      | Média                                                                                                                                                                                                                                                                                                       |
| **Total de Fases**    | 4                                                                                                                                                                                                                                                                                                           |
| **Prioridade**        | Alta                                                                                                                                                                                                                                                                                                        |
| **Épico**             | Bloco 4a — Gestão A (Onda 2)                                                                                                                                                                                                                                                                                 |
| **PRDs Relacionados** | PRD-040 (Visão Executiva — cockpit), PRD-041 (Vendas), PRD-042 (Metas), PRD-017 (Pipeline de Leads), PRD-006 (RBAC), PRD-053 (IA Analítica), PRD-057 (Copiloto Analítico — consome o catálogo de métricas)                                                                                                    |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                                                                          |
| **Padrão de código**  | Feature-based; código em `src/features/sales-forecast/`; motor puro em `src/features/sales-forecast/engine/`; hook em `src/features/sales-forecast/hooks/`                                                                                                                                                   |

### Critérios de Complexidade Utilizados

> **Justificativa de Média:** motor de projeção determinístico (não-ML) sobre dados já existentes; reaproveita a projeção linear por meta (`IGoalProgress.projection`, PRD-042), a agregação de realizado (`useSalesAnalytics`, PRD-041) e os atributos de pipeline (`ILead.estimatedValue`, `temperature`, `stage`, PRD-017). A complexidade vem de: três cenários com pesos parametrizáveis, consolidação respeitando a hierarquia loja/equipe/individual, gap-to-meta, e contrato preparado para troca por ML na Fase 2 sem refatorar consumidores. Não há entidade persistida nova relevante — o forecast é **derivado em runtime**, no mesmo padrão de `calculateGoalProgress`.

---

## Contexto do Problema

Os painéis gerenciais do GALLO (PRD-040 a 055) são, hoje, **descritivos**: dizem o que já aconteceu. O cockpit (PRD-040) mostra faturamento realizado, a tela de Vendas (PRD-041) mostra evolução e funil, e o sistema de Metas (PRD-042) mostra quanto da meta foi atingido com uma projeção linear simples por meta. Falta a camada **preditiva consolidada** que responde à pergunta que o dono faz no meio do mês: *"no ritmo atual, onde eu vou fechar — e quanto falta?"*.

Três situações concretas expõem a lacuna. **O gestor decide tarde.** Ele só percebe que o mês vai fechar abaixo da meta quando o mês acabou — perdendo a janela de reagir (cobrar a equipe, abrir promoção, segurar desconto). **A projeção linear por meta é cega ao pipeline.** A projeção atual do PRD-042 extrapola o ritmo do realizado, mas ignora que há R$ 80 mil em oportunidades quentes no pipeline (PRD-017) prestes a fechar — subestimando o resultado provável. **Não há cenário.** Um único número de projeção não comunica risco; o gestor precisa enxergar a banda entre o pior e o melhor caso para calibrar a decisão.

Este PRD entrega o **forecast de fechamento**: uma projeção que combina o que já foi realizado, o pipeline aberto ponderado pela probabilidade de fechamento, e o ritmo necessário para a meta — apresentada em três cenários e com a distância para a meta (gap) explícita. O motor é **determinístico e roda inteiro na Fase 1** sobre os mocks (matemática, não LLM nem ML); a Fase 2 apenas refina os pesos com um modelo de sazonalidade/tendência, atrás da mesma interface.

---

## Conceito da Solução

### Situação Atual (As-Is)

- O cockpit (PRD-040) e a tela de Vendas (PRD-041) mostram **realizado** e comparativos, sem projeção de fechamento.
- O sistema de Metas (PRD-042) computa `IGoalProgress.projection` — uma **projeção linear isolada por meta** (extrapolação do ritmo), sem incorporar o pipeline aberto e sem cenários.
- Não existe um número consolidado de "onde o período vai fechar" por loja/equipe/vendedor, nem o gap-to-meta projetado.

### Situação Desejada (To-Be)

- Um motor puro `computeForecast(input)` projeta o fechamento do período combinando **três sinais**:
  1. **Realizado** — soma do que já fechou no período (via agregação de Vendas, PRD-041).
  2. **Pipeline ponderado** — soma de `ILead.estimatedValue` das oportunidades abertas, cada uma multiplicada por um **peso de probabilidade** derivado de `temperature` (frio/morno/quente) e/ou do `stage` do pipeline (PRD-017).
  3. **Ritmo (run-rate)** — extrapolação do realizado pelo tempo restante do período, reaproveitando o conceito já presente em `IGoalProgress`.
- O resultado é apresentado em **três cenários** — pessimista, provável, otimista — calculados pela combinação desses sinais com pesos parametrizáveis.
- O forecast respeita a **hierarquia de metas** (loja / equipe-dormente / individual) e o **escopo RBAC** (PRD-006): cada usuário vê apenas o forecast do seu escopo.
- Para cada cenário, exibe o **gap-to-meta projetado** (quanto falta para a meta no cenário) e, quando útil, "quantos pedidos/tickets faltam" para alcançá-la.
- Superfícies: **widget no cockpit** (PRD-040), **integração no gap das Metas** (PRD-042) e **página dedicada** com drill-down por loja/vendedor/cenário.
- Contrato `IForecastProvider` (ou função substituível) deixa o motor pronto para **troca por ML na Fase 2** sem refatorar os consumidores.

### Alternativas Consideradas

| Alternativa                                              | Por que descartada                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| ML real no MVP                                           | Custo + dependência de dados históricos reais (inexistentes na Fase 1 mock); projeção determinística cobre o valor  |
| Reusar só a projeção linear do PRD-042                   | Ignora o pipeline aberto — subestima o resultado; e não tem cenários nem consolidação cross-meta                    |
| Número único de projeção (sem cenários)                  | Não comunica risco; gestor não calibra decisão sem a banda pessimista↔otimista                                      |
| Forecast como entidade persistida (com provider/CRUD)    | É um valor **derivado**; persistir gera dessincronia. Segue o padrão de `calculateGoalProgress` (runtime, não salvo) |
| Ponderar pipeline só por `stage`                         | `temperature` é o sinal heurístico mais direto do SDR (PRD-020); usar ambos (config) é mais robusto                 |
| Forecast só no cockpit                                   | O gap projetado é mais acionável dentro das Metas (PRD-042); precisa das duas superfícies + página de drill-down    |

---

## Escopo

### Incluído

- ✅ Tipos `IForecast`, `IForecastScenario`, `ForecastScenarioType`, `IForecastInput`, `IForecastConfig` em `src/shared/types/` (ex.: `forecast.ts` ou extensão de `bi.ts`)
- ✅ Motor puro `computeForecast(input, config)` em `src/features/sales-forecast/engine/`
- ✅ Ponderação de pipeline por `temperature` e/ou `stage` com pesos parametrizáveis (`IForecastConfig`)
- ✅ Três cenários (`pessimista` / `provavel` / `otimista`) com fórmula explícita e documentada
- ✅ Cálculo de gap-to-meta projetado por cenário (consome `IGoal` / `IGoalProgress` do PRD-042)
- ✅ Métricas suportadas no MVP: `revenue` (faturamento) e `tickets` (nº de pedidos); margem como extensão se houver dado de margem realizado disponível
- ✅ Hook `useForecast(filters)` derivando o forecast em runtime (sem persistência)
- ✅ Consolidação respeitando hierarquia: loja, equipe (dormente — preparada mas não exibida no MVP), individual
- ✅ Página `SalesForecastPage` em `/app/forecast` (rota nova; placeholder pode já existir no shell do PRD-003)
- ✅ Widget `<ForecastWidget>` no cockpit (PRD-040)
- ✅ Integração do forecast no gap das Metas (PRD-042) — projeção enriquecida com pipeline e cenários
- ✅ Sub-rota de configuração `/app/configuracoes/forecast` (Owner) — pesos de temperatura/estágio e parâmetros dos cenários
- ✅ Permissões: escopo por papel (Vendedor vê só o próprio; Gestor a loja; Owner cross-store; Financeiro conforme PRD-006)
- ✅ Estados de loading (skeleton) e empty (período sem dados suficientes)
- ✅ Mobile responsivo
- ✅ Contrato preparado para ML na Fase 2 (`IForecastProvider` substituível) — documentado, não implementado
- ✅ Audit log em mudança de configuração de forecast

### Excluído

- ❌ ML real / modelo de sazonalidade e tendência — Fase 2 (Onda 9, atrás da mesma interface)
- ❌ Forecast por SKU / por categoria de produto — Fase 2 (este PRD foca em faturamento/tickets por loja/vendedor)
- ❌ Forecast multi-período encadeado (trimestre composto por meses projetados) — Fase 2
- ❌ Narrativa do forecast em linguagem natural ("você deve fechar em…") — pertence ao PRD-156 (relatórios narrativos) / PRD-057 (copiloto analítico)
- ❌ Persistência de snapshots históricos de forecast (forecast accuracy tracking) — Fase 2
- ❌ Notificações automáticas de desvio de forecast — pertence ao sistema de notificações (PRD-008/009 + Onda 8)
- ❌ Simulação de cenário "what-if" interativa (ex.: "e se eu subir 5% o preço") — feature separada, candidata futura

---

## Requisitos Funcionais

### Modelo e tipos

- **RF-001:** Definir `ForecastScenarioType = "pessimista" | "provavel" | "otimista"`.
- **RF-002:** Definir `IForecastScenario` contendo: `type`, `projectedValue` (valor projetado de fechamento), `gapToTarget` (meta − projetado; negativo = acima da meta), `gapPercent`, `ordersNeeded?` (nº de pedidos faltantes quando `metric = tickets` ou derivável do ticket médio), e `breakdown` (composição: `realized`, `weightedPipeline`, `runRateRemainder`).
- **RF-003:** Definir `IForecast` contendo: `scope` (`{ level: GoalLevel; targetId: ID; storeId: ID }`), `metric` (`GoalMetric`, MVP: `revenue` | `tickets`), `period` (`IGoalPeriod`), `realizedValue`, `targetValue?` (da meta vigente, se houver), `scenarios: IForecastScenario[]`, `daysElapsed`, `daysRemaining`, `totalDays`, `computedAt`.
- **RF-004:** Definir `IForecastConfig` contendo: `temperatureWeights` (`{ frio: number; morno: number; quente: number }`), `scenarioFactors` (`{ pessimista: number; provavel: number; otimista: number }`), `pipelineWeightingMode` (`"temperature" | "stage" | "hybrid"`), e `stageWeights?` (peso por `ILeadStage.id`).
- **RF-005:** Tipos garantem ausência de `any`; reutilizam `GoalLevel`, `GoalMetric`, `GoalPeriodType`, `IGoalPeriod` de `bi.ts` e `Money` de `common.ts`.

### Motor de projeção (`computeForecast`)

- **RF-006:** `computeForecast(input: IForecastInput, config: IForecastConfig): IForecast` é uma **função pura** (sem side effects, sem fetch).
- **RF-007:** `IForecastInput` agrega: realizado do período (de Vendas/orders), lista de oportunidades abertas do escopo (`ILead[]` com `estimatedValue`, `temperature`, `stage`), meta vigente do escopo (`IGoal` / `IGoalProgress`, opcional), e o calendário do período (`daysElapsed`, `daysRemaining`, `totalDays`).
- **RF-008:** **Pipeline ponderado** = Σ (`lead.estimatedValue` × peso), onde o peso vem de `config.pipelineWeightingMode`:
  - `"temperature"`: usa `config.temperatureWeights[lead.temperature]`.
  - `"stage"`: usa `config.stageWeights[lead.stage.id]`.
  - `"hybrid"`: combina ambos (ex.: média ou produto, definido no motor e documentado).
- **RF-009:** **Run-rate remainder** = projeção do realizado pelo tempo restante: `(realizedValue / max(daysElapsed, 1)) × daysRemaining`. Reaproveita o conceito de `IGoalProgress.projection` (PRD-042) como referência.
- **RF-010:** **Cenário provável** = `realizedValue` + `pipelinePonderado` + fração do `runRateRemainder` (evitando dupla contagem com o pipeline — o motor documenta como o pipeline e o run-rate são combinados sem somar a mesma receita duas vezes).
- **RF-011:** **Cenário pessimista** e **otimista** = `provavel` ajustado por `config.scenarioFactors` (ex.: pessimista = provável × fator < 1; otimista = provável × fator > 1), com fórmula explícita e comentada no código.
- **RF-012:** Para cada cenário, calcular `gapToTarget`, `gapPercent` e, quando aplicável, `ordersNeeded` (a partir do gap e do ticket médio do período).
- **RF-013:** Quando não há meta vigente para o escopo, `targetValue`, `gapToTarget` e `gapPercent` ficam `undefined` (forecast ainda é exibido, sem gap).
- **RF-014:** Quando `daysElapsed` é insuficiente para projeção confiável (limiar configurável, ex.: < 3 dias), o motor sinaliza baixa confiança (flag em `IForecast`, ex.: `lowConfidence: true`) para a UI advertir.

### Hook e consolidação

- **RF-015:** `useForecast(filters)` em `src/features/sales-forecast/hooks/` deriva o forecast em runtime a partir dos providers existentes (Vendas/orders, Leads/pipeline, Goals), **sem persistir** o resultado.
- **RF-016:** `filters` suporta: `storeId`, `sellerId?`, `period`, `metric`. Sem `sellerId` → forecast da loja; com `sellerId` → forecast individual.
- **RF-017:** Consolidação de loja = agregação dos insumos da loja (não a soma simples dos forecasts individuais), respeitando a hierarquia da PRD-042; o nível `team` é preparado no tipo mas **não exibido** no MVP (equipe dormente).
- **RF-018:** Memorização (memoização) do cálculo conforme RNF de performance.

### Página dedicada (`/app/forecast`)

- **RF-019:** `SalesForecastPage` em `src/features/sales-forecast/pages/`, substituindo eventual placeholder do shell (PRD-003).
- **RF-020:** Header com filtros (loja, período, métrica) + URL sync, no mesmo padrão das demais telas de BI (ex.: `useCockpitFilters` / `useSalesFilters`).
- **RF-021:** Cartão principal com os **três cenários** lado a lado (pessimista / provável / otimista): valor projetado, gap-to-meta e indicador visual (semáforo coerente com `GoalProgressStatus` do PRD-042).
- **RF-022:** Visualização da **composição** do cenário provável (realizado + pipeline ponderado + run-rate) — barra empilhada ou breakdown explícito (transparência, no espírito do `context` do PRD-053).
- **RF-023:** Quando o escopo é a loja (Gestor/Owner), tabela/lista de forecast **por vendedor** com drill-down para o forecast individual.
- **RF-024:** Empty state quando o período não tem dados suficientes (RF-014): mensagem clara, sem exibir números enganosos.

### Integração com o cockpit (PRD-040)

- **RF-025:** Componente `<ForecastWidget>` exportado para o cockpit, mostrando o cenário **provável** do escopo do usuário + gap-to-meta + link para `/app/forecast`.
- **RF-026:** O widget reutiliza o slot/área de KPIs do `ExecutiveCockpitPage` (PRD-040) sem quebrar o layout existente.

### Integração com Metas (PRD-042)

- **RF-027:** No detalhe/lista de metas, a projeção linear isolada é **enriquecida** com o forecast (pipeline ponderado + cenários), exibida de forma complementar — sem remover ou alterar o cálculo existente de `IGoalProgress`.
- **RF-028:** O gap projetado por cenário aparece junto à meta correspondente quando `metric` e `scope` coincidem.

### Configuração (`/app/configuracoes/forecast`)

- **RF-029:** `ForecastConfigPage` (Owner), sub-rota da área de configurações (PRD-019).
- **RF-030:** Editar `temperatureWeights` (sliders frio/morno/quente), `scenarioFactors` (pessimista/otimista), `pipelineWeightingMode` e (quando `stage`/`hybrid`) os `stageWeights`.
- **RF-031:** Valores default sensatos pré-preenchidos (ex.: frio 0.1, morno 0.4, quente 0.75; pessimista 0.85, otimista 1.15 — ratificáveis pelo arquiteto).
- **RF-032:** Banner informativo: "Projeção determinística baseada em ritmo + pipeline. Modelo preditivo (ML) com sazonalidade disponível na Fase 2."

### Permissões

- **RF-033:** Vendedor vê **apenas** o forecast do próprio escopo (`sellerId` = ele); não acessa forecast de outro vendedor nem o consolidado da loja, conforme PRD-006.
- **RF-034:** Gestor vê a loja; Owner cross-store; Financeiro conforme escopo definido na PRD-006.
- **RF-035:** A configuração (`/app/configuracoes/forecast`) é restrita ao Owner via `GuardedRoute`.

### Auditoria

- **RF-036:** Audit log (`auditLog()`, PRD-006) em mudança de configuração de forecast (`action="forecast_config_update"`).

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** `computeForecast` executa em < 50ms para o volume de mocks de uma loja; a página renderiza em < 500ms.
- **RNF-002 (Pureza):** O motor é função pura e testável isoladamente (sem dependência de React, fetch ou data/hora global injetada — a "data atual" entra por parâmetro/contexto).
- **RNF-003 (Memoização):** Resultados memoizados por (`scope`, `metric`, `period`, hash dos insumos).
- **RNF-004 (Responsividade):** Funcional de 360px a 1920px; os três cenários reflowam para vertical no mobile.
- **RNF-005 (Acessibilidade):** WCAG 2.1 AA; cores de cenário/semáforo acompanhadas de rótulo textual (não dependem só da cor).
- **RNF-006 (Tipagem):** Zero `any`; reuso máximo dos tipos de `bi.ts`, `goals.ts`, `lead.ts`.
- **RNF-007 (Compatibilidade Fase 2):** A assinatura do cálculo permite substituir o motor determinístico por um `IForecastProvider` baseado em ML **sem refatorar** os consumidores (`useForecast`, widget, página).
- **RNF-008 (Tema):** Light e dark conforme PRD-001.

---

## Critérios de Aceitação

### RF-008/RF-010: Pipeline ponderado entra no cenário provável

```gherkin
DADO uma loja com R$ 100.000 já realizados no período
E um pipeline aberto com R$ 40.000 em oportunidades "quente" (peso 0,75)
QUANDO o forecast do cenário provável é calculado
ENTÃO o valor projetado incorpora ~R$ 30.000 do pipeline ponderado além do realizado
E a composição (breakdown) mostra realizado, pipeline ponderado e run-rate separadamente
```

### RF-011: Três cenários distintos

```gherkin
DADO um cenário provável projetado em R$ 150.000
E scenarioFactors pessimista 0,85 e otimista 1,15
QUANDO os cenários são exibidos
ENTÃO o pessimista mostra ~R$ 127.500 e o otimista ~R$ 172.500
E os três aparecem lado a lado com indicador visual e rótulo textual
```

### RF-012/RF-013: Gap-to-meta projetado

```gherkin
DADO uma meta de faturamento de R$ 180.000 para o período
E um cenário provável de R$ 150.000
QUANDO o gap é calculado
ENTÃO gapToTarget = R$ 30.000 e gapPercent ≈ 16,7%
E quando não existe meta vigente, o forecast é exibido sem gap (sem erro)
```

### RF-033: Escopo por papel (RBAC)

```gherkin
DADO um usuário com papel Vendedor
QUANDO ele acessa /app/forecast
ENTÃO vê apenas o forecast do próprio escopo
E não consegue visualizar o forecast consolidado da loja nem o de outro vendedor
```

### RF-014: Baixa confiança no início do período

```gherkin
DADO um período com apenas 2 dias decorridos (limiar de confiança = 3)
QUANDO o forecast é calculado
ENTÃO a flag lowConfidence é true
E a UI exibe um aviso de que a projeção ainda é pouco confiável
```

### Cenários de Erro

```gherkin
DADO que o provider de Vendas ou de Leads falha ao carregar
QUANDO a página de forecast tenta renderizar
ENTÃO exibe um estado de erro amigável com opção de tentar novamente
E não quebra o cockpit (PRD-040) onde o widget está embutido (fail gracefully)
```

```gherkin
DADO um período sem nenhum dado realizado e sem pipeline
QUANDO o forecast é calculado
ENTÃO exibe empty state ("dados insuficientes para projetar"), sem números enganosos
```

---

## Fases de Implementação

| Fase | Nome                          | Entregável                                                                                         |
| ---- | ----------------------------- | -------------------------------------------------------------------------------------------------- |
| 1    | Tipos + Motor                 | Tipos `IForecast*`/`IForecastConfig`; `computeForecast` puro com cenários e ponderação; testes unitários |
| 2    | Hook + Consolidação           | `useForecast(filters)`; consolidação por hierarquia/escopo; integração com providers de Vendas/Leads/Goals |
| 3    | Superfícies                   | `SalesForecastPage` (`/app/forecast`); `<ForecastWidget>` no cockpit (PRD-040); enriquecimento do gap nas Metas (PRD-042) |
| 4    | Configuração + Permissões + Polish | `ForecastConfigPage` (`/app/configuracoes/forecast`); RBAC; audit; responsivo; a11y; empty/loading states |

### Detalhamento das Fases

#### Fase 1: Tipos + Motor

Definir os tipos reaproveitando `bi.ts`/`lead.ts`. Implementar `computeForecast` como função pura, com a fórmula dos três sinais (realizado, pipeline ponderado, run-rate) e dos três cenários documentada em comentário. Cobrir com testes unitários os casos: com/sem meta, com/sem pipeline, baixa confiança, `pipelineWeightingMode` nos três modos.

#### Fase 2: Hook + Consolidação

`useForecast` agrega os insumos dos providers existentes (`useSalesAnalytics`/orders, `useLeadsProvider`, `useGoals`/`useIndicatorProgress`) e chama o motor. Consolidação de loja por agregação de insumos (não soma de forecasts). Memoização (RNF-003). Nível `team` preparado no tipo, não exibido.

#### Fase 3: Superfícies

Página dedicada com os três cenários, breakdown e tabela por vendedor (drill-down). Widget no cockpit reusando o slot de KPIs. Enriquecimento **aditivo** do gap nas Metas (sem alterar `calculateGoalProgress`).

#### Fase 4: Configuração + Permissões + Polish

Tela de configuração (Owner) com sliders de pesos/fatores e modo de ponderação. `GuardedRoute` e escopo por papel (PRD-006). Audit em mudança de config. Estados de loading/empty/erro, responsividade e acessibilidade.

---

## Dependências

### PRDs Anteriores

- **PRD-040 (Visão Executiva):** superfície do widget (`ExecutiveCockpitPage`, slot de KPIs).
- **PRD-041 (Vendas):** fonte do realizado (`useSalesAnalytics`, evolução, ticket médio).
- **PRD-042 (Metas):** `IGoal`, `IGoalProgress.projection`, hierarquia de escopo, semáforo `GoalProgressStatus`.
- **PRD-017 (Pipeline de Leads):** `ILead.estimatedValue`, `temperature`, `stage` — insumos da ponderação.
- **PRD-006 (RBAC):** escopo por papel e `auditLog()`.
- **PRD-019 (Configurações Admin):** área onde mora `/app/configuracoes/forecast`.
- **PRD-003 (Shell):** rota/placeholder de `/app/forecast`.

### Serviços Externos

- Nenhum na Fase 1 (cálculo local determinístico). Fase 2: gateway de LLM/ML (PRD-151) para o motor preditivo.

### Decisões Pendentes

- **DP-1:** Ratificar os pesos default (`temperatureWeights`, `scenarioFactors`) e o limiar de baixa confiança.
- **DP-2:** Modo de ponderação default (`temperature`, `stage` ou `hybrid`). Sugestão: `temperature` (sinal mais direto do SDR no MVP).
- **DP-3:** Fórmula exata de combinação pipeline × run-rate no cenário provável (evitar dupla contagem) — sugestão a detalhar na Fase 1.
- **DP-4:** Incluir `margin` como métrica do MVP depende de haver margem realizada disponível na agregação de Vendas (PRD-041/049). Se não houver, fica como extensão.
- **DP-5:** Ratificar a rota `/app/forecast` e o número **PRD-056** no INDEX da Fase 1.
- **DP-6:** Codinome de versão (sugestão: **Horizon**).

---

## Cadeia de PRDs

Este PRD pertence ao **Bloco 4a — Gestão A (Onda 2)** e antecede o **PRD-057 (Copiloto Analítico)**:

```
PRD-040 (Cockpit) ─┐
PRD-041 (Vendas) ──┤
PRD-042 (Metas) ───┼──> PRD-056 (Forecast de Fechamento) ──> PRD-057 (Copiloto Analítico)
PRD-017 (Pipeline)─┘                                          (reusa o catálogo de métricas)
```

O PRD-056 consolida métricas e fórmulas de projeção que o **PRD-057** consumirá como parte do seu catálogo de métricas (text-to-metric). A sequência **056 → 057** é deliberada.

---

## Considerações de Segurança

### Dados Sensíveis

- O forecast expõe valores comerciais sensíveis (faturamento projetado, gap, desempenho por vendedor). Acesso estritamente por escopo RBAC (PRD-006).

### Autenticação e Autorização

- Vendedor: somente o próprio forecast. Gestor: a loja. Owner: cross-store. Configuração: Owner only (`GuardedRoute`).

### Auditoria

- Mudança de configuração de forecast registrada em audit log (RF-036). O cálculo em si é derivado e não persistido — não há trilha de dado salvo a auditar.

---

## Fluxos de Usuário

### Fluxo Principal (Happy Path) — Gestor no meio do mês

1. Marina (Gestor) abre o cockpit (PRD-040) no dia 15.
2. O `<ForecastWidget>` mostra: cenário provável R$ 150k, meta R$ 180k, gap R$ 30k (semáforo amarelo).
3. Marina clica no widget → `/app/forecast`.
4. Vê os três cenários e a composição: realizado R$ 100k + pipeline ponderado R$ 30k + run-rate R$ 20k.
5. Abre a tabela por vendedor → identifica que dois vendedores puxam o gap para baixo.
6. Age: redistribui foco / cobra follow-up das oportunidades quentes do pipeline.

### Fluxos de Exceção

- **Sem meta vigente:** forecast é exibido sem gap; o cartão indica "sem meta definida para o período".
- **Início do período (baixa confiança):** aviso de projeção pouco confiável; cenários ainda exibidos com a flag.
- **Vendedor:** acessa `/app/forecast` e vê só o próprio escopo; consolidado da loja não aparece.

### Fluxos de Erro

- Falha de provider (Vendas/Leads) → estado de erro com retry na página; o widget no cockpit falha isoladamente (fail gracefully) sem derrubar o cockpit.

---

### Convenções de Código (Referência Rápida)

| Elemento        | Convenção            | Exemplo                                                      |
| --------------- | -------------------- | ----------------------------------------------------------- |
| **Página**      | PascalCase + `Page`  | `SalesForecastPage`, `ForecastConfigPage`                   |
| **Componentes** | PascalCase           | `<ForecastWidget>`, `<ForecastScenarioCard>`                |
| **Motor**       | camelCase (fn pura)  | `computeForecast`                                           |
| **Hooks**       | camelCase + `use`    | `useForecast`                                               |
| **Pasta**       | kebab-case           | `sales-forecast/`                                           |
| **Git commits** | Conventional Commits | `feat(sales-forecast): add deterministic closing forecast`  |

---

## Notas para o Agente Desenvolvedor

### Esclarecimento de Dúvidas

> **💬 Antes de implementar, faça perguntas para esclarecer qualquer ambiguidade sobre: requisitos funcionais, restrições técnicas, dependências, comportamentos esperados e critérios de aceitação.**

### Instruções Obrigatórias

> **⚠️ 1. ANTES DE IMPLEMENTAR:**
> "Lembre-se: explore a estrutura dos dados, planeje primeiro cada passo, analise, investigue a fundo, pense e revise tudo antes de realizar qualquer atualização ou implementação."

> **⚠️ 2. APÓS IMPLEMENTAR:**
> - Incrementar a versão do app seguindo [SemVer](https://semver.org/)
> - Atualizar o CHANGELOG.md seguindo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
> - Atualizar o registro de versão no banco de dados (se aplicável)
> - Renomear este arquivo adicionando `_DONE` ao final
>   Ex: `PRD-056-forecast-fechamento.md` → `PRD-056-forecast-fechamento_DONE.md`
> - Atualizar a seção "Status de Implementação" com:
>   - Status: ✅ IMPLEMENTADO
>   - Data de Implementação
>   - Versão do App após implementação
>   - Observações relevantes

### Guia de Versionamento (SemVer)

| Tipo de Mudança | Ação | Exemplo |
|-----------------|------|---------|
| Correção de bug | PATCH +1 | 1.0.0 → 1.0.1 |
| Nova funcionalidade | MINOR +1, PATCH = 0 | 1.0.1 → 1.1.0 |
| Mudança incompatível | MAJOR +1, outros = 0 | 1.1.0 → 2.0.0 |

**Codinomes:** Para MINOR ou MAJOR, gerar codinome em inglês baseado no contexto das mudanças. Sugestão: **Horizon**.

🔗 Referência: https://semver.org/

### Guia de Changelog (Keep a Changelog)

Tipos de mudança a documentar:
- **Added** — novas funcionalidades
- **Changed** — mudanças em funcionalidades existentes
- **Deprecated** — funcionalidades que serão removidas
- **Removed** — funcionalidades removidas
- **Fixed** — correções de bugs
- **Security** — correções de vulnerabilidades

🔗 Referência: https://keepachangelog.com/en/1.1.0/

### Princípios de Implementação

| Princípio | Descrição |
|-----------|-----------|
| **Não bloquear fluxo principal** | O widget de forecast não pode derrubar o cockpit se falhar |
| **Fail gracefully** | Se um insumo (pipeline ou meta) faltar, projetar com o que há e sinalizar |
| **Preservar evidências** | Expor sempre a composição (breakdown) — número sem origem não gera confiança |
| **Testar incrementalmente** | Validar o motor puro (Fase 1) antes das superfícies |
| **Documentar decisões** | Registrar a fórmula de combinação pipeline × run-rate escolhida |

### Orientações Gerais

| Aspecto | Orientação |
|---------|------------|
| **Reuso** | Reaproveitar `IGoalProgress.projection` (PRD-042) como base do run-rate; não recriar agregação de realizado — usar `useSalesAnalytics` (PRD-041) |
| **Forecast é derivado** | Não persistir o forecast; computar em runtime no padrão de `calculateGoalProgress`. Persistência de snapshots é Fase 2 |
| **Determinístico, não ML** | A Fase 1 é matemática pura. Não introduzir LLM/ML aqui — o ponto de troca é o contrato `IForecastProvider` na Fase 2 |
| **Pipeline sem dupla contagem** | Garantir que a receita do pipeline ponderado e a do run-rate não sejam somadas duplicadamente no cenário provável |
| **Transparência** | Sempre exibir a composição do cenário (realizado + pipeline + run-rate), no espírito do `context` do PRD-053 |
| **Aditivo nas Metas** | A integração com PRD-042 é complementar — não alterar nem remover o cálculo existente de `IGoalProgress` |
| **Performance** | Memoizar; manter o motor < 50ms para os mocks de uma loja |

### O que NÃO Fazer

| ❌ Evitar                                                                  |
| -------------------------------------------------------------------------- |
| Introduzir ML/LLM no motor da Fase 1 (é o ponto de troca da Fase 2)        |
| Persistir o forecast como entidade (gera dessincronia; é derivado)         |
| Somar pipeline ponderado e run-rate sem tratar dupla contagem              |
| Alterar/remover o cálculo de `IGoalProgress` do PRD-042                    |
| Exibir um número único sem os três cenários                               |
| Exibir números quando os dados são insuficientes (usar empty/lowConfidence) |
| Expor forecast de loja/outro vendedor para o papel Vendedor                |
| Recriar agregação de vendas em vez de reusar `useSalesAnalytics`           |
| Forecast por SKU/categoria (fora do escopo deste PRD — Fase 2)             |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ⏳ PENDENTE |
| **Data de Implementação** | - |
| **Versão do App** | - |
| **Implementado por** | - |
| **Observações** | - |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                                                            |
| ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 03/06/2026 | v1     | Criação inicial — forecast de fechamento determinístico (realizado + pipeline ponderado + run-rate) em três cenários, gap-to-meta, integração cockpit/metas, contrato preparado para ML na Fase 2 |

---

**AILA — Sistemas Inteligentes**
*Frederico Westphalen / RS — Brasil*

---

## Status de Implementação

- **Status:** ✅ Concluído
- **Versão:** v0.66.0 "Oracle" (2026-06-05)
- **Branch/PR:** entregue no épico `feat/prd-056-057-foundation` (PR #35); documentado/lançado nesta release.
- **Entrega:** Motor puro de projeção (`computeForecast` — realizado + pipeline ponderado + ritmo, regra residual, 3 cenários) + superfície em `/app/gestao/forecast` (cards de cenário, breakdown, tabela por vendedor, alternância faturamento/pedidos) e widget no cockpit executivo; configuração por loja (Owner).
- **Local do código:** `src/features/sales-forecast/`
- **Fase 2 (futuro):** seletor de período, métrica de margem, projeção por ML.
