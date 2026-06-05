# PRD-057: Copiloto Analítico (Q&A em Linguagem Natural)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                                                                               |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                                                                                                    |
| **Objetivo**          | Permitir que o gestor pergunte sobre os dados do negócio em linguagem natural ("quanto faturei de filtro Volvo esse mês?") e receba a resposta numérica correta, com a fonte (painel) citada e drill-down — via **text-to-metric** (LLM escolhe métricas de um catálogo; o sistema executa de forma determinística), com mock por intenção na Fase 1 e LLM real na Fase 2 |
| **Tipo**              | Feature                                                                                                                                                                                                                                                                                                                |
| **Complexidade**      | Alta                                                                                                                                                                                                                                                                                                                   |
| **Total de Fases**    | 5                                                                                                                                                                                                                                                                                                                      |
| **Prioridade**        | Alta                                                                                                                                                                                                                                                                                                                   |
| **Épico**             | Bloco 4b — Gestão B (Onda 2)                                                                                                                                                                                                                                                                                            |
| **PRDs Relacionados** | PRD-056 (Forecast — fornece métricas ao catálogo), PRD-041 (Vendas), PRD-040 (Cockpit), PRD-045 (Curva ABC), PRD-046 (Carteira), PRD-049 (Rentabilidade), PRD-053 (IA Analítica — princípios de citação/escopo), PRD-006 (RBAC), PRD-019 (Configurações), PRD-151 (LLM Gateway — Fase 2), PRD-025 (Copiloto de Vendas — distinto) |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                                                                                     |
| **Padrão de código**  | Feature-based; código em `src/features/analytics-copilot/`; catálogo de métricas em `src/features/analytics-copilot/catalog/`; resolver/executor em `src/features/analytics-copilot/engine/`; provider em `providers/data` (contrato `IAnalyticsCopilotProvider`)                                                        |

### Critérios de Complexidade Utilizados

> **Justificativa de Alta:** envolve um **catálogo de métricas** (registry de métricas + dimensões + filtros) que mapeia perguntas a consultas executáveis; um **resolver de intenção** (mock por keyword/regra na Fase 1, LLM na Fase 2) que nunca executa SQL livre; um **executor determinístico** que reaproveita os hooks de BI existentes; renderização de resposta com **citação obrigatória** e drill-down; herança de **escopo RBAC** (PRD-006) em cada consulta; histórico de sessão de conversa; e um contrato `IAnalyticsCopilotProvider` preparado para troca por LLM+RAG na Fase 2 (gateway PRD-151) sem refatorar consumidores. A superfície conversacional e a governança de "o número nunca vem do modelo" elevam a complexidade.

---

## Contexto do Problema

O GALLO acumula 15+ painéis de BI (PRD-040 a 055): cockpit, vendas, metas, curva ABC, carteira, rentabilidade, DRE, fluxo de caixa, estoque, atendimento. A inteligência existe — mas está **espalhada e exige navegação**. O dono da GALLO, com perfil comercial e não técnico, não percorre dez telas para cruzar dados. Três situações concretas:

**A resposta existe, mas o caminho é longo.** Para saber "quanto vendi de filtro Volvo esse mês vs. o passado", o gestor abre Vendas (PRD-041), filtra por categoria, por marca, por período, e ainda compara manualmente com o mês anterior. São muitos cliques para uma pergunta simples. **O dado fica subutilizado.** Painéis ricos só geram valor se forem consultados; o que não é fácil de acessar, na prática, não é usado. **A linguagem do gestor não é a do dashboard.** Ele pensa em perguntas ("meus dois piores vendedores em margem?"), não em filtros e dimensões.

Este PRD entrega o **copiloto analítico**: uma interface conversacional onde o gestor pergunta em português e recebe a resposta correta, com a **fonte citada** (qual painel) e um link de drill-down para conferir. O ponto arquitetural crítico — e o que diferencia uma ferramenta confiável de um gerador de números inventados — é que **o número nunca vem do modelo de linguagem**: o LLM apenas *interpreta a pergunta e escolhe* dentro de um catálogo de métricas pré-definidas; quem calcula é o mesmo motor determinístico que alimenta os painéis (`useSalesAnalytics`, `useIndicators`, etc.). Na Fase 1, o "interpretador" é um resolver por intenção/keyword sobre os mocks; na Fase 2, troca-se por LLM + RAG via o gateway do PRD-151, atrás da mesma interface.

---

## Conceito da Solução

### Situação Atual (As-Is)

- Os dados vivem em painéis isolados (PRD-040 a 055), cada um com seus próprios filtros e hooks de agregação.
- Não há ponto de entrada em linguagem natural; toda consulta exige navegar até o painel certo e configurar filtros manualmente.
- O copiloto **de vendas** (PRD-025) existe, mas atua *dentro de uma conversa com cliente* (sugestões para o vendedor) — não responde perguntas analíticas sobre o negócio. São features distintas.

### Situação Desejada (To-Be)

- Uma superfície de chat (painel/drawer) onde o usuário digita uma pergunta em linguagem natural.
- O fluxo segue **text-to-metric**, em quatro etapas, com governança rígida:
  1. **Interpretar** — o resolver mapeia a pergunta a uma `IMetricQuery` estruturada (qual métrica, dimensões, filtros, período). Fase 1: regra/keyword. Fase 2: LLM.
  2. **Validar escopo** — a `IMetricQuery` herda o escopo RBAC do usuário (PRD-006); um Vendedor não consegue consultar a margem de um colega.
  3. **Executar** — o executor roda a consulta de forma **determinística**, reaproveitando os hooks/motores de BI existentes. O número **não** vem do LLM.
  4. **Responder com citação** — a resposta traz o valor, a **fonte** (qual painel/PRD originou) e um link de **drill-down** para conferir, no espírito do `context` do PRD-053.
- Um **catálogo de métricas** (`IMetricDefinition[]`) declara o que pode ser perguntado: métricas (faturamento, margem, pedidos, ticket médio, positivação, curva ABC, forecast…), dimensões (vendedor, canal, categoria, marca, cliente, loja, tempo) e filtros suportados. O catálogo é a "superfície de contrato" entre linguagem e dados — e é extensível.
- Quando a pergunta **não** mapeia a nenhuma métrica do catálogo, o copiloto responde com transparência ("ainda não sei responder isso") e sugere perguntas próximas — nunca inventa um número.
- Contrato `IAnalyticsCopilotProvider` (mock → LLM) deixa a Fase 2 como **drop-in**, no mesmo padrão dos demais providers (`useDataProviderSlice`).

### Alternativas Consideradas

| Alternativa                                          | Por que descartada                                                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Text-to-SQL** (LLM gera SQL livre no banco)        | Alucina número, vaza dado entre escopos, risco de performance e injeção. O número precisa vir do motor determinístico, não do LLM |
| LLM real no MVP                                      | Custo + dependência de dados reais (inexistentes na Fase 1). O resolver por intenção cobre a experiência na demo             |
| Resposta sem citação/drill-down                      | Número sem fonte não gera confiança; gestor não age sobre dado que não pode conferir (princípio herdado do PRD-053)          |
| Copiloto que também **executa ações** (criar meta…)  | Escopo deste PRD é **consulta/leitura**. Ações são risco e feature separada                                                  |
| Reusar o copiloto de vendas (PRD-025)                | Consumidor e propósito diferentes (sugestão na conversa × Q&A analítico); acoplar os dois polui ambos                        |
| Sem catálogo (resolver mapeia direto para hooks)     | Vira código frágil e não-extensível; o catálogo é o contrato que o LLM consome na Fase 2 e que governa o que é perguntável   |

---

## Escopo

### Incluído

- ✅ Tipos `IMetricDefinition`, `IMetricQuery`, `IAnalyticsAnswer`, `IAnalyticsSession`, `IAnalyticsMessage` em `src/shared/types/` (ex.: `analytics-copilot.ts`)
- ✅ **Catálogo de métricas** (`IMetricDefinition[]`) em `src/features/analytics-copilot/catalog/` — métricas, dimensões, filtros, sinônimos/keywords e a fonte (PRD/painel) de cada métrica
- ✅ **Resolver de intenção** `resolveQuery(question, context, catalog): IMetricQuery | null` — mock por keyword/regra na Fase 1 (função pura/determinística)
- ✅ **Executor determinístico** `executeQuery(query, scope): IAnalyticsAnswer` — reaproveita os hooks de BI existentes (`useSalesAnalytics`, `useIndicators`, `useForecast`, ABC, carteira…)
- ✅ Contrato `IAnalyticsCopilotProvider.ask(question, context): Promise<IAnalyticsAnswer>` em `providers/data` (mock na Fase 1)
- ✅ Herança de **escopo RBAC** (PRD-006) na `IMetricQuery` — clamp por papel antes de executar
- ✅ **Citação obrigatória** na resposta: métrica/fonte (PRD/painel) + link de drill-down com filtros pré-aplicados
- ✅ Resposta com **valor + comparativo** quando a pergunta pede (ex.: "vs. mês passado") e mini-visual opcional (sparkline/numérico) quando agrega valor
- ✅ Tratamento de **pergunta fora do catálogo**: resposta honesta + sugestões próximas (nunca inventa número)
- ✅ Superfície de chat: painel/drawer acessível do cockpit (PRD-040) e/ou item global; campo de pergunta + histórico da sessão
- ✅ **Perguntas sugeridas** (chips) por papel/contexto, para guiar o uso
- ✅ Histórico de sessão em memória (sem persistência no MVP)
- ✅ Sub-rota de configuração `/app/configuracoes/copiloto-analitico` (Owner): toggle ativo + banner Fase 2
- ✅ Permissões: escopo por papel; Vendedor consulta apenas o próprio escopo
- ✅ Estados de loading ("pensando…"), vazio e erro
- ✅ Mobile responsivo
- ✅ Contrato preparado para LLM + RAG na Fase 2 (gateway PRD-151) — documentado, não implementado
- ✅ Audit log de consultas (ação + métrica resolvida; sem persistir conteúdo sensível além do necessário)

### Excluído

- ❌ LLM real / NLU por modelo — Fase 2 (Onda 9, atrás da mesma interface; gateway PRD-151)
- ❌ RAG sobre documentos da empresa (boletins, contratos) — Fase 2
- ❌ Execução de **ações** via chat (criar meta, transferir carteira, etc.) — este PRD é leitura/consulta apenas
- ❌ Geração de relatório narrativo longo ("como foi o mês" em prosa) — pertence ao PRD-156
- ❌ Text-to-SQL / consulta livre ao banco — proibido por design (ver Alternativas)
- ❌ Persistência de sessões/histórico de conversa analítica — Fase 2
- ❌ Geração de gráficos arbitrários sob demanda ("faça um gráfico de…") — MVP entrega valor numérico + mini-visual fixo por métrica; visualização livre é Fase 2
- ❌ Perguntas que cruzem dados ainda não modelados em painel — limitadas pelo catálogo (transparência sobre o que não sabe)

---

## Requisitos Funcionais

### Modelo e tipos

- **RF-001:** `IMetricDefinition` contendo: `id`, `label`, `description`, `metricKey` (alinhado ao vocabulário existente, ex.: `IndicatorMetric` / `GoalMetric`), `dimensions` (lista de dimensões suportadas: `vendedor`, `canal`, `categoria`, `marca`, `cliente`, `loja`, `tempo`), `supportedFilters`, `keywords`/`synonyms` (para o resolver mock), `source` (`{ prd: string; panelRoute: string; label: string }`) e `requiredRole?` (escopo mínimo).
- **RF-002:** `IMetricQuery` contendo: `metricId`, `dimensions` (selecionadas), `filters` (ex.: `{ marca: "Volvo", categoria: "filtros" }`), `period` (`IGoalPeriod`-compatível), `comparison?` (ex.: `"previous_period"`), e `scope` (preenchido na validação RBAC).
- **RF-003:** `IAnalyticsAnswer` contendo: `query` (a `IMetricQuery` resolvida), `value` (número ou série), `formattedValue` (string pt-BR, ex.: "R$ 84.320"), `comparison?` (valor anterior + delta), `citation` (`source` da métrica + `drillDownUrl` com filtros), `visual?` (tipo de mini-visual sugerido), `confidence`/`resolved` (se a pergunta foi mapeada) e `suggestions?` (perguntas próximas quando não resolvida).
- **RF-004:** `IAnalyticsSession` / `IAnalyticsMessage` para o histórico de chat em memória (papel `user` | `assistant`, timestamp, referência à `IAnalyticsAnswer`).
- **RF-005:** Zero `any`; reaproveitar `GoalMetric`/`IndicatorMetric`, `IGoalPeriod`, `Division`, `Money`, `ABCClass` dos tipos existentes.

### Catálogo de métricas

- **RF-006:** Catálogo declarativo `metricCatalog: IMetricDefinition[]` cobrindo, no mínimo: faturamento, margem, nº de pedidos, ticket médio, positivação, curva ABC (classe), carteira (status), e forecast de fechamento (consome PRD-056).
- **RF-007:** Cada métrica declara sua `source` (PRD + rota do painel) — usada na citação e no drill-down.
- **RF-008:** O catálogo é o **único** vocabulário consultável; perguntas fora dele não são respondidas com número (RF-016).

### Resolver de intenção (Fase 1: mock determinístico)

- **RF-009:** `resolveQuery(question, context, catalog): IMetricQuery | null` é função pura; na Fase 1 usa matching por keywords/sinônimos do catálogo + extração simples de período, marca, categoria e dimensão a partir do texto.
- **RF-010:** Reaproveita, quando útil, a extração de atributos já existente no domínio (ex.: lookup de marcas em `part-identification/data/brands.ts`) para reconhecer "Volvo", "Scania", categorias, etc.
- **RF-011:** Quando a pergunta é ambígua (mapeia a mais de uma métrica/dimensão), o resolver pode retornar uma `IMetricQuery` parcial e a UI pede esclarecimento (chip de desambiguação) — sem inventar.

### Validação de escopo (RBAC)

- **RF-012:** Antes de executar, a `IMetricQuery` é submetida a um clamp de escopo conforme o papel (PRD-006): Vendedor → força `sellerId` = ele e bloqueia dimensão `vendedor` cruzada com colegas; Gestor → restringe à loja; Owner → cross-store; Financeiro → conforme PRD-006.
- **RF-013:** Se a pergunta pede dado fora do escopo do usuário, a resposta é uma recusa transparente ("você não tem acesso a esse dado"), registrada em audit — nunca o número.

### Executor determinístico

- **RF-014:** `executeQuery(query, scope): IAnalyticsAnswer` calcula o valor reaproveitando os hooks/motores de BI existentes (sem recriar agregação). O número provém exclusivamente desses motores.
- **RF-015:** O executor monta a `citation` (fonte + `drillDownUrl` com os filtros da query) e o `comparison` quando solicitado.
- **RF-016:** Quando `resolveQuery` retorna `null` (fora do catálogo), `executeQuery` não é chamado; a resposta é honesta com `resolved: false` + `suggestions` de perguntas próximas.

### Provider

- **RF-017:** Contrato `IAnalyticsCopilotProvider` com `ask(question, context): Promise<IAnalyticsAnswer>`; hook `useAnalyticsCopilotProvider()` via `useDataProviderSlice`, no padrão dos demais providers.
- **RF-018:** Implementação **mock** na Fase 1 orquestra `resolveQuery` → clamp RBAC → `executeQuery`. A implementação **LLM** (Fase 2) substitui o resolver pelo modelo, mantendo clamp + executor determinísticos.

### Superfície de chat

- **RF-019:** Painel/drawer `AnalyticsCopilotPanel` acessível a partir do cockpit (PRD-040) e/ou de um ponto global do `/app` (ex.: botão na TopBar do shell, PRD-003).
- **RF-020:** Campo de pergunta + lista de mensagens (histórico da sessão em memória) com estado "pensando…" durante o `ask`.
- **RF-021:** Cada resposta do assistente renderiza: `formattedValue` em destaque, `comparison` (delta com seta/cor + rótulo textual), `citation` (fonte clicável → drill-down) e `visual` opcional.
- **RF-022:** Respostas não resolvidas mostram a mensagem honesta + chips de `suggestions`.
- **RF-023:** **Perguntas sugeridas** (chips) iniciais por papel/contexto (ex.: para Gestor: "faturamento do mês vs. anterior", "top 3 vendedores", "clientes em risco").

### Configuração

- **RF-024:** `AnalyticsCopilotConfigPage` em `/app/configuracoes/copiloto-analitico` (Owner): toggle ativo (`IPlatformSettings.analyticsCopilotEnabled`) + banner "NLU por IA real (LLM) disponível na Fase 2 — atualmente baseado em interpretação por regras sobre o catálogo de métricas".

### Permissões

- **RF-025:** Acesso ao copiloto conforme papel; Vendedor consulta apenas o próprio escopo (RF-012). Configuração restrita ao Owner via `GuardedRoute`.

### Auditoria

- **RF-026:** Audit log por consulta (`action="analytics_copilot_query"`) registrando a métrica resolvida e o escopo — sem armazenar conteúdo sensível além do necessário.
- **RF-027:** Audit log em mudança de configuração (`action="analytics_copilot_config_update"`).

---

## Requisitos Não-Funcionais

- **RNF-001 (Governança de dados):** O valor numérico **nunca** é produzido pelo resolver/LLM — sempre pelo executor determinístico sobre os motores de BI. Requisito inegociável.
- **RNF-002 (Performance):** `resolveQuery` + `executeQuery` respondem em < 300ms sobre os mocks de uma loja (sem latência de rede na Fase 1).
- **RNF-003 (Pureza):** `resolveQuery` e o catálogo são puros/determinísticos e testáveis isoladamente.
- **RNF-004 (Extensibilidade):** Adicionar uma métrica = adicionar uma `IMetricDefinition` ao catálogo + mapear seu executor, sem tocar na superfície de chat.
- **RNF-005 (Responsividade):** Funcional de 360px a 1920px; painel vira tela cheia no mobile.
- **RNF-006 (Acessibilidade):** WCAG 2.1 AA; deltas/cores acompanhados de rótulo textual; chat navegável por teclado.
- **RNF-007 (Tipagem):** Zero `any`; reuso máximo de tipos existentes.
- **RNF-008 (Compatibilidade Fase 2):** Trocar o resolver mock por LLM (gateway PRD-151) **sem** refatorar clamp RBAC, executor, provider ou UI.
- **RNF-009 (Tema):** Light e dark conforme PRD-001.

---

## Critérios de Aceitação

### RF-009/RF-014/RF-015: Pergunta resolvida com citação

```gherkin
DADO o catálogo com a métrica "faturamento" (dimensões marca, categoria, tempo)
QUANDO o usuário pergunta "quanto faturei de filtro Volvo esse mês?"
ENTÃO o resolver produz uma IMetricQuery { metricId: faturamento, filters: { marca: Volvo, categoria: filtros }, period: mês atual }
E o executor calcula o valor pelo motor de Vendas (PRD-041)
E a resposta exibe o valor formatado, a fonte (Vendas) e um link de drill-down com os filtros aplicados
```

### RF-001: Número nunca vem do modelo

```gherkin
DADO qualquer pergunta resolvível
QUANDO a resposta é montada
ENTÃO o valor numérico provém do executor determinístico (hooks de BI)
E o resolver/LLM apenas determinou QUAL métrica/filtros usar, nunca o número
```

### RF-016: Pergunta fora do catálogo

```gherkin
DADO uma pergunta que não mapeia a nenhuma métrica ("qual a previsão do tempo amanhã?")
QUANDO o copiloto processa
ENTÃO responde com transparência que não sabe responder isso
E sugere perguntas próximas suportadas pelo catálogo
E NÃO exibe nenhum número inventado
```

### RF-012/RF-013: Escopo RBAC respeitado

```gherkin
DADO um usuário Vendedor
QUANDO ele pergunta "qual a margem do vendedor Carlos?"
ENTÃO o clamp de escopo bloqueia a consulta cruzada
E a resposta é uma recusa transparente, registrada em audit
E nenhum dado de outro vendedor é exibido
```

### RF-021: Comparativo

```gherkin
DADO a pergunta "faturamento desse mês vs. o passado"
QUANDO resolvida
ENTÃO a resposta mostra o valor atual, o anterior e o delta (com seta/cor E rótulo textual)
E cita a fonte com drill-down
```

### Cenários de Erro

```gherkin
DADO que um hook de BI subjacente falha ao carregar
QUANDO o executor tenta calcular
ENTÃO o copiloto exibe um estado de erro amigável (sem quebrar o cockpit onde está embutido)
E sugere tentar novamente
```

```gherkin
DADO uma pergunta ambígua que mapeia a duas métricas
QUANDO o resolver não consegue decidir
ENTÃO o copiloto pede esclarecimento (chip de desambiguação) em vez de adivinhar
```

---

## Fases de Implementação

| Fase | Nome                       | Entregável                                                                                                       |
| ---- | -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1    | Tipos + Catálogo           | Tipos `IMetric*`/`IAnalytics*`; catálogo declarativo de métricas com fontes e keywords; testes do catálogo       |
| 2    | Resolver + Executor + RBAC | `resolveQuery` (mock determinístico); clamp de escopo (PRD-006); `executeQuery` reusando hooks de BI; testes unitários |
| 3    | Provider                   | `IAnalyticsCopilotProvider` + impl mock orquestrando resolve → clamp → execute; contrato documentado p/ Fase 2   |
| 4    | Superfície de chat         | `AnalyticsCopilotPanel`; render de resposta com citação/drill-down/comparativo; perguntas sugeridas; histórico em memória |
| 5    | Config + Permissões + Polish | Config (Owner); RBAC na superfície; audit; estados loading/empty/erro; responsivo; a11y                          |

### Detalhamento das Fases

#### Fase 1: Tipos + Catálogo

Modelar os tipos reaproveitando `bi.ts`/`indicators.ts`. Construir o catálogo como dado declarativo: cada `IMetricDefinition` com sua fonte (PRD/rota), dimensões, filtros e keywords/sinônimos. Testar que toda métrica do catálogo tem fonte e ao menos uma keyword.

#### Fase 2: Resolver + Executor + RBAC

`resolveQuery` puro (keyword + extração de período/marca/categoria, reusando `brands.ts`). Clamp de escopo por papel (PRD-006) **antes** de executar. `executeQuery` chama os hooks de BI existentes — sem recriar agregação. Cobrir com testes: resolução correta, fora do catálogo (`null`), ambiguidade, clamp por papel.

#### Fase 3: Provider

`IAnalyticsCopilotProvider.ask` orquestra resolve → clamp → execute e devolve `IAnalyticsAnswer`. Mock na Fase 1 via `useDataProviderSlice`. Documentar como a impl LLM (Fase 2) substitui apenas o resolver, mantendo clamp + executor.

#### Fase 4: Superfície de chat

Painel/drawer com campo + histórico + estado "pensando…". Render rico da resposta: valor, comparativo, citação clicável (drill-down), mini-visual opcional. Não-resolvidas → mensagem honesta + chips. Perguntas sugeridas por papel.

#### Fase 5: Config + Permissões + Polish

Toggle de ativação (Owner). RBAC na superfície e nas consultas. Audit por consulta e por mudança de config. Estados de loading/empty/erro, responsividade e acessibilidade.

---

## Dependências

### PRDs Anteriores

- **PRD-056 (Forecast):** fornece a métrica de forecast e consolida o conceito de catálogo de métricas que este PRD generaliza.
- **PRD-041 (Vendas), PRD-040 (Cockpit), PRD-045 (ABC), PRD-046 (Carteira), PRD-049 (Rentabilidade):** fontes das métricas e dos hooks de execução; superfícies de drill-down.
- **PRD-006 (RBAC):** clamp de escopo e `auditLog()`.
- **PRD-019 (Configurações Admin):** abriga `/app/configuracoes/copiloto-analitico`.
- **PRD-003 (Shell):** ponto de acesso global ao painel (ex.: TopBar) e rotas.
- **PRD-025 (Copiloto de Vendas):** feature **distinta** — garantir que não há colisão de nomes/escopo (este é analítico, aquele é de conversa).

### Serviços Externos

- Nenhum na Fase 1 (resolver e executor locais). Fase 2: **gateway de LLM (PRD-151)** + RAG.

### Decisões Pendentes

- **DP-1:** Ratificar o conjunto mínimo de métricas do catálogo no MVP (sugestão: as 8 do RF-006).
- **DP-2:** Ponto de acesso da superfície: botão global na TopBar (PRD-003) e/ou apenas a partir do cockpit (PRD-040). Sugestão: ambos.
- **DP-3:** Formato do mini-visual por métrica (sparkline numérico vs. só número) — definir por métrica na Fase 4.
- **DP-4:** Política de audit: registrar o texto da pergunta ou apenas a métrica resolvida (privacidade × rastreabilidade). Sugestão: métrica + escopo, sem o texto livre.
- **DP-5:** Ratificar a rota `/app/configuracoes/copiloto-analitico` e o número **PRD-057** no INDEX da Fase 1.
- **DP-6:** Codinome de versão (sugestão: **Oracle**).

---

## Cadeia de PRDs

Este PRD pertence ao **Bloco 4b — Gestão B (Onda 2)** e sucede o **PRD-056 (Forecast)**:

```
PRD-040/041/045/046/049 (Painéis de BI) ──┐
PRD-056 (Forecast → métrica no catálogo) ─┼──> PRD-057 (Copiloto Analítico)
PRD-006 (RBAC — clamp de escopo) ─────────┘            │
                                                       └──(Fase 2)──> PRD-151 (LLM Gateway) + RAG
```

O catálogo de métricas criado aqui é o contrato que o LLM consumirá na Fase 2. O copiloto analítico (057), o copiloto de vendas (025) e o SDR LLM (153) compartilharão o **mesmo gateway (PRD-151)** na Fase 2 — mas permanecem features independentes.

---

## Considerações de Segurança

### Dados Sensíveis

- Respostas expõem dados comerciais e financeiros sensíveis (faturamento, margem, desempenho individual). Toda consulta passa pelo clamp de escopo (PRD-006) antes de executar.

### Autenticação e Autorização

- Escopo por papel em **cada** consulta (não apenas na rota): Vendedor → próprio escopo; Gestor → loja; Owner → cross-store; Financeiro → conforme PRD-006. Configuração: Owner only.

### Auditoria

- Consultas e mudanças de configuração registradas em audit log (RF-026/RF-027). Recusas por escopo também são auditadas. Política de armazenamento do texto da pergunta a definir (DP-4).

### Governança de IA

- **O modelo nunca produz o número** (RNF-001). Isso elimina a principal classe de risco (alucinação de dado) e mantém a auditabilidade — o valor é sempre rastreável ao motor de BI que o calculou.

---

## Fluxos de Usuário

### Fluxo Principal (Happy Path) — Owner pergunta

1. O Owner abre o painel do copiloto (botão na TopBar).
2. Digita: "quanto faturei de filtro Volvo esse mês vs. o passado?".
3. O resolver mapeia → `IMetricQuery { faturamento, marca: Volvo, categoria: filtros, período: mês, comparison: previous_period }`.
4. Clamp de escopo (Owner → cross-store, ok). Executor calcula via motor de Vendas (PRD-041).
5. Resposta: "R$ 84.320 este mês (+12% vs. R$ 75.200 no anterior)" + fonte **Vendas** (clicável) + delta com seta verde e rótulo.
6. O Owner clica na fonte → abre Vendas já filtrado por Volvo/filtros/mês para conferir.

### Fluxos de Exceção

- **Fora do catálogo:** "Ainda não sei responder isso. Você pode perguntar: faturamento por marca, margem por categoria, top vendedores…".
- **Ambígua:** chip de desambiguação ("Você quer faturamento ou margem?").
- **Vendedor consultando colega:** recusa transparente + audit.

### Fluxos de Erro

- Hook de BI falha → estado de erro com retry no painel; não derruba o cockpit (fail gracefully).

---

### Convenções de Código (Referência Rápida)

| Elemento        | Convenção            | Exemplo                                                            |
| --------------- | -------------------- | ----------------------------------------------------------------- |
| **Página**      | PascalCase + `Page`  | `AnalyticsCopilotConfigPage`                                      |
| **Componentes** | PascalCase           | `<AnalyticsCopilotPanel>`, `<AnalyticsAnswerCard>`                |
| **Funções**     | camelCase (puras)    | `resolveQuery`, `executeQuery`                                    |
| **Catálogo**    | camelCase (dado)     | `metricCatalog`                                                   |
| **Provider**    | `I...Provider` + hook| `IAnalyticsCopilotProvider`, `useAnalyticsCopilotProvider`        |
| **Pasta**       | kebab-case           | `analytics-copilot/`                                              |
| **Git commits** | Conventional Commits | `feat(analytics-copilot): add text-to-metric Q&A (mock resolver)` |

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
>   Ex: `PRD-057-copiloto-analitico.md` → `PRD-057-copiloto-analitico_DONE.md`
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

**Codinomes:** Para MINOR ou MAJOR, gerar codinome em inglês baseado no contexto das mudanças. Sugestão: **Oracle**.

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
| **Não bloquear fluxo principal** | O painel do copiloto não pode derrubar o cockpit se falhar |
| **Fail gracefully** | Se um hook de BI falha, exibir erro com retry; nunca um número parcial sem aviso |
| **Preservar evidências** | Toda resposta cita a fonte e oferece drill-down — número sem origem é proibido |
| **Testar incrementalmente** | Validar catálogo (F1) e resolver/executor (F2) antes da superfície de chat |
| **Documentar decisões** | Registrar a estratégia de matching do resolver mock e o mapeamento métrica→executor |

### Orientações Gerais

| Aspecto | Orientação |
|---------|------------|
| **O número vem do BI, não do modelo** | RNF-001 é inegociável. O resolver/LLM só escolhe a métrica; o executor determinístico calcula. Reusar `useSalesAnalytics`, `useIndicators`, `useForecast`, ABC, carteira — sem recriar agregação |
| **Catálogo como contrato** | Toda capacidade nova entra como `IMetricDefinition`. O catálogo é o que o LLM consumirá na Fase 2 — mantê-lo declarativo e completo (com `source`) |
| **Citação obrigatória** | Espelhar o princípio do `context` do PRD-053: sem fonte e drill-down, não há confiança |
| **Escopo em cada consulta** | Clamp RBAC (PRD-006) **antes** de executar, não só na rota. Vendedor nunca vê dado de colega |
| **Distinto do PRD-025** | Este é o copiloto **analítico** (Q&A sobre BI). Não confundir nem acoplar com o copiloto **de vendas** (sugestão na conversa) |
| **Reuso de extração** | Aproveitar `part-identification/data/brands.ts` para reconhecer marcas/categorias no resolver mock |
| **Honestidade sobre limites** | Pergunta fora do catálogo → dizer que não sabe + sugerir; jamais inventar número |

### O que NÃO Fazer

| ❌ Evitar                                                                       |
| ------------------------------------------------------------------------------- |
| Text-to-SQL ou qualquer consulta livre ao banco                                |
| Deixar o resolver/LLM produzir o valor numérico (proibido — RNF-001)           |
| Introduzir LLM real na Fase 1 (é o ponto de troca da Fase 2 via PRD-151)       |
| Responder pergunta fora do catálogo com número inventado                       |
| Recriar agregação de BI em vez de reusar os hooks existentes                   |
| Aplicar escopo só na rota e não em cada consulta                               |
| Acoplar/confundir com o copiloto de vendas (PRD-025)                           |
| Executar ações (criar meta, transferir) — este PRD é leitura/consulta apenas   |
| Gerar gráficos arbitrários sob demanda (Fase 2)                                |
| Persistir histórico de sessão (memória apenas no MVP)                          |

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

| Data       | Versão | Alteração                                                                                                                                                                                       |
| ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 03/06/2026 | v1     | Criação inicial — copiloto analítico Q&A em linguagem natural via text-to-metric (catálogo + resolver mock + executor determinístico + clamp RBAC + citação obrigatória), contrato preparado para LLM/RAG na Fase 2 |

---

**AILA — Sistemas Inteligentes**
*Frederico Westphalen / RS — Brasil*

---

## Status de Implementação

- **Status:** ✅ Concluído
- **Versão:** v0.66.0 "Oracle" (2026-06-05)
- **Branch/PR:** `feat/copiloto-pagina-multimodo` — PR #36
- **Entrega:** Núcleo determinístico (catálogo de métricas, resolver/clamp/executor, port `IAnalyticsDataAccess`) entregue no épico anterior; **página dedicada multi-modo** em `/app/gestao/copiloto` nesta release — modos Foco/Histórico/Split (persistidos), hero de sugestões por categoria, answer card com número herói/delta/sparkline/citação/drill-down, histórico de sessões em localStorage, painel de detalhe (Split). Entrada via menu Gestão + botão na TopBar + Ctrl/Cmd+K (Sheet aposentado).
- **Local do código:** `src/features/analytics-copilot/`
- **RNF-001:** preservado — todo número vem dos motores de BI via `runCopilotQuery → executeQuery → IAnalyticsDataAccess`, nunca da camada de UI.
- **Fase 2 (futuro):** NLU por LLM real, persistência de sessões em Supabase, renomear conversas.
