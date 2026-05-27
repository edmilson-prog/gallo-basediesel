# PRD-042: Metas (Goals)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                    |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                                         |
| **Objetivo**          | Construir o sistema de gestão de metas comerciais — configuração por Owner/Gestor, tracking em tempo real do progresso de cada vendedor e loja, visualização individual e agregada, e base para gamificação (PRD-043) e comissões (PRD-047) |
| **Tipo**              | Feature                                                                                                                                                                                                                                     |
| **Complexidade**      | Alta                                                                                                                                                                                                                                        |
| **Total de Fases**    | 5                                                                                                                                                                                                                                           |
| **Prioridade**        | Alta                                                                                                                                                                                                                                        |
| **Épico**             | Bloco 4a — Gestão A (Onda 2)                                                                                                                                                                                                                |
| **PRDs Relacionados** | PRD-014 (Painel Gestor — widget), PRD-032 (Pedido — alimenta progresso), PRD-043 (Gamificação), PRD-044 (Positivação), PRD-047 (Comissões)                                                                                                  |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                          |
| **Padrão de código**  | Feature-based; código em `src/features/goals/`; reutiliza `DashboardLayout` e `DetailLayout`                                                                                                                                                |

### Critérios de Complexidade

> **Justificativa de Alta:** 5 tipos de meta com cálculos derivados distintos (faturamento, ticket médio, número de pedidos, positivação, novos clientes), 3 períodos (mensal/trimestral/anual), 3 escopos (individual/loja/global cross-store), cálculo de progresso em tempo real baseado em `IOrder` com status pago/concluído, dashboard individual (vendedor) e agregado (Gestor/Owner) com visualizações diferentes, indicadores visuais (barras de progresso com semáforos, % atingido, projeção de fechamento), histórico de metas com gráfico de evolução temporal, configurabilidade pelo Owner com workflow estruturado, e impacto direto em PRDs 043 (gamificação) e 047 (comissões) — base do BI da Onda 2.

---

## Contexto do Problema

A GALLO BASE DIESEL hoje gerencia metas por planilha — gestor define no início do mês, vendedor lembra de cabeça, fechamento é dolorido (calculando manualmente). Três problemas concretos:

**Vendedor não sabe onde está no meio do mês.** "Quanto falta pra eu bater minha meta?" — sem painel, vendedor reage só no fim do mês, geralmente atrasado. **Gestor não tem visibilidade em tempo real.** "Time vai bater meta este mês?" — descobre dia 28, tarde demais para corrigir. **Sem tracking estruturado, comissão e gamificação ficam impossíveis.** PRD-047 (comissões) e PRD-043 (gamificação) dependem de metas mensuráveis e auditáveis.

Este PRD entrega: sistema completo de metas com 5 tipos mensuráveis (cobrindo as principais dimensões comerciais), tracking em tempo real alimentado pelos pedidos (PRD-032), dashboard individual e agregado, histórico evolutivo, e base de dados estruturada para PRDs futuros.

---

## Conceito da Solução

### Tipos de meta

5 tipos principais cobrindo os ângulos comerciais centrais:

| Tipo                 | Mede                              | Cálculo                                                | Bom para...                                |
| -------------------- | --------------------------------- | ------------------------------------------------------ | ------------------------------------------ |
| `faturamento`        | Receita total                     | Σ(IOrder.total) onde paymentStatus='paid'              | Vendedores e lojas                         |
| `ticket_medio`       | Valor médio por pedido            | Σ(total) / N(pedidos)                                  | Vendedores de B2B (incentiva pedido maior) |
| `quantidade_pedidos` | Volume operacional                | N(IOrder com paymentStatus='paid')                     | Vendedores B2C ou volume                   |
| `positivacao`        | Clientes que compraram no período | N(distinct customerId com pedido no período)           | Cobertura de carteira                      |
| `novos_clientes`     | Aquisição                         | N(ICustomer criados no período com sellerId atribuído) | Crescimento da base                        |

### Escopos

| Escopo       | Aplicação                                 | Quem vê                              |
| ------------ | ----------------------------------------- | ------------------------------------ |
| `individual` | Meta atribuída a um vendedor              | Vendedor (sua), Gestor/Owner (todas) |
| `store`      | Meta da loja inteira (soma de vendedores) | Gestor da loja, Owner                |
| `global`     | Meta cross-store                          | Owner only (no MVP só matriz)        |

> **Equipes dormentes:** conforme briefing, `ITeam` está modelado mas hierarquia de metas por equipe **não opera no MVP**. Apenas individual e loja.

### Períodos

| Período      | Duração    | Fechamento                 |
| ------------ | ---------- | -------------------------- |
| `mensal`     | 30/31 dias | Último dia do mês 23:59:59 |
| `trimestral` | 3 meses    | Último dia do trimestre    |
| `anual`      | 12 meses   | 31/12 23:59:59             |

### Modelo (revisão PRD-002)

```typescript
IGoal {
  id: ID;
  name: string;                    // "Faturamento Janeiro 2026" — autogerado ou customizado
  type: GoalType;                  // 'faturamento' | 'ticket_medio' | 'quantidade_pedidos' | 'positivacao' | 'novos_clientes'
  scope: GoalScope;                // 'individual' | 'store' | 'global'
  period: GoalPeriod;              // 'mensal' | 'trimestral' | 'anual'
  // Atribuição
  sellerId?: ID;                   // se scope='individual'
  storeId: ID;                     // sempre presente
  // Período
  startDate: ISO8601;
  endDate: ISO8601;
  // Valor da meta
  targetValue: number;             // valor a atingir (R$ ou número conforme tipo)
  // Tracking (computed, não persistido — derivado)
  // currentValue: calculado em runtime via hooks
  // Status
  status: GoalStatus;              // 'ativa' | 'concluida' | 'arquivada' | 'cancelada'
  // Recompensas (placeholder, integração com PRD-043 e PRD-047)
  rewardDescription?: string;       // texto livre: "Bônus de R$ 500 ao atingir"
  // Auditoria
  createdBy: ID;                   // quem criou (Owner/Gestor)
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

type GoalStatus = 'ativa' | 'concluida' | 'arquivada' | 'cancelada';
type GoalType = 'faturamento' | 'ticket_medio' | 'quantidade_pedidos' | 'positivacao' | 'novos_clientes';
type GoalScope = 'individual' | 'store' | 'global';
type GoalPeriod = 'mensal' | 'trimestral' | 'anual';

IGoalProgress {
  // Derivado em runtime
  goalId: ID;
  currentValue: number;
  percentage: number;              // 0-100+
  projection: number;              // estimativa de fechamento baseada em ritmo atual
  daysRemaining: number;
  status: 'no_caminho' | 'atencao' | 'atrasada' | 'concluida';
  trend: 'subindo' | 'estavel' | 'caindo';
}
```

### Status visual (semáforo)

Calculado a partir de `percentage` e `daysRemaining`:

| Indicador     | Critério                          | Cor                       |
| ------------- | --------------------------------- | ------------------------- |
| 🟢 No caminho | percentage / esperadoNaData ≥ 1.0 | Verde                     |
| 🟡 Atenção    | 0.7 ≤ ratio < 1.0                 | Amarelo                   |
| 🔴 Atrasada   | ratio < 0.7                       | Vermelho                  |
| ✅ Concluída  | percentage ≥ 100                  | Verde brilhante com check |

`esperadoNaData = targetValue * (diasPassados / totalDias)` — linha proporcional.

### Cálculo de progresso

Função `calculateGoalProgress(goal, orders, customers)` em runtime:

```typescript
function calculateGoalProgress(goal: IGoal, context: IGoalContext): IGoalProgress {
  switch (goal.type) {
    case "faturamento":
      currentValue = sum(orders.filter(matchesGoal && paid).map((o) => o.total));
      break;
    case "ticket_medio":
      orders = orders.filter(matchesGoal && paid);
      currentValue = orders.length ? sum(orders.map((o) => o.total)) / orders.length : 0;
      break;
    case "quantidade_pedidos":
      currentValue = orders.filter(matchesGoal && paid).length;
      break;
    case "positivacao":
      currentValue = new Set(orders.filter(matchesGoal && paid).map((o) => o.customerId)).size;
      break;
    case "novos_clientes":
      currentValue = customers.filter(
        (c) => c.createdAt in periodRange && c.sellerId === goal.sellerId,
      ).length;
      break;
  }

  // Calcular percentage, projection, status, trend
  return { currentValue, percentage, projection, daysRemaining, status, trend };
}
```

### Listagem `/app/metas`

Aba para vendedores: **"Minhas metas"** (apenas suas).
Aba para Gestor/Owner: **"Todas as metas"** + **"Por loja"** + **"Resumo"**.

Tabela com colunas:

- Nome
- Tipo (badge)
- Escopo (individual: avatar do vendedor; loja: nome da loja)
- Período (badge: mensal/trimestral/anual)
- Faixa de datas
- Target value
- Progresso (barra + valor + %)
- Status (badge colorido)
- Projeção de fechamento
- Ações

Filtros: tipo, escopo, status, vendedor (Gestor/Owner), loja (Owner), período.

### Criação `/app/metas/nova`

Página dedicada (Owner/Gestor):

**Seção 1 — Configuração:**

- Tipo (5 opções com explicação inline)
- Período (mensal/trimestral/anual)
- Datas (start/end — auto-preenchidas conforme período, editáveis)
- Nome (autogerado: "[Tipo] [Período] [Mês/Tri/Ano]", editável)

**Seção 2 — Escopo:**

- Radio: Individual / Loja / Global (Owner only)
- Se Individual: dropdown de vendedor (filtrado por loja se Gestor)
- Se Loja: dropdown de loja (Owner) ou auto-locked (Gestor)

**Seção 3 — Valor:**

- Input numérico do target
- Sugestões inteligentes: "Mês passado: R$ X (achievement Y%)"
- Comparativo: "Esta meta é X% maior/menor que a anterior"

**Seção 4 — Recompensa (opcional):**

- Textarea livre: descrição da recompensa
- Placeholder: "Será visível ao vendedor"

**Botões:** Salvar rascunho / Criar e ativar

### Detalhe `/app/metas/:id`

Layout `DetailLayout`:

**Seção 1 — Header:** nome, tipo, escopo, datas, status badge, botões (editar, arquivar, cancelar)

**Seção 2 — Resumo de progresso:**

- Barra de progresso grande
- Valor atual / valor target
- % atingido
- Status visual (semáforo)
- Projeção: "Mantendo ritmo, fecha em R$ X (Y% da meta)"
- Dias restantes

**Seção 3 — Gráfico evolutivo:**

- Recharts line chart mostrando progresso diário vs linha esperada (proporcional ao período)
- Eixo X: dias do período
- Eixo Y: valor acumulado
- 2 linhas: realizado (cor da marca) e esperado (cinza tracejado)

**Seção 4 — Composição:**

- Para `faturamento`: lista de pedidos que contribuíram (link para PRD-032)
- Para `positivacao`: lista de clientes positivados (link para PRD-012)
- Para `novos_clientes`: lista de clientes adquiridos
- Para `ticket_medio`: estatísticas (valor min, max, mediana, desvio)
- Para `quantidade_pedidos`: lista de pedidos

**Seção 5 — Histórico de mudanças:** audit log da meta (criação, alterações de target, atualizações)

### Dashboard individual (vendedor)

Rota `/app/metas` para vendedor:

- Header com saudação + resumo: "Você tem 3 metas ativas"
- Cards de meta (1 por meta ativa) com:
  - Nome, tipo
  - Barra de progresso visual
  - Valor atual / target
  - % e status
  - Dias restantes
  - Recompensa (se houver)
  - Botão "Ver detalhes" → `/app/metas/:id`

### Dashboard agregado (Gestor/Owner)

Rota `/app/metas` para Gestor/Owner:

- KPIs no topo:
  - Total de metas ativas
  - % média de atingimento
  - Vendedores acima de 100% (heroes)
  - Vendedores abaixo de 70% (atenção)
- Tabela completa com filtros
- Gráfico de barras: progresso por vendedor (% atingido)

### Integração com PRD-014 (Painel Gestor)

Widget no Painel Gestor: "Metas do mês"

- Lista compacta das metas com progresso
- Click leva para `/app/metas/:id`

### Permissões

| Papel        | Listar     | Criar         | Editar        | Arquivar      |
| ------------ | ---------- | ------------- | ------------- | ------------- |
| **Owner**    | tudo       | ✅            | ✅            | ✅            |
| **Gestor**   | sua loja   | ✅ (sua loja) | ✅ (sua loja) | ✅ (sua loja) |
| **Vendedor** | suas metas | ❌            | ❌            | ❌            |

### Histórico evolutivo

Aba "Histórico" na tela:

- Lista de metas anteriores (concluídas, arquivadas) com performance
- Gráfico de evolução temporal: % atingido em cada período passado

### Alternativas Consideradas

| Alternativa                                   | Por que foi descartada                                        |
| --------------------------------------------- | ------------------------------------------------------------- |
| Apenas meta de faturamento                    | Pobre — ticket médio e positivação são tão importantes quanto |
| Metas por equipe no MVP                       | Briefing define equipes dormentes; complexidade desnecessária |
| Sem projeção de fechamento                    | Vendedor reage só quando já é tarde                           |
| Apenas dashboard agregado                     | Vendedor precisa ver sua própria meta destacada               |
| Edição de target a qualquer momento sem audit | Comissões dependem de metas estáveis                          |
| Cálculo de progresso assíncrono (background)  | Painel precisa ser tempo real; cálculo em runtime é melhor    |
| Meta vencida = perdida                        | Reabertura/extensão é uso real (mês quebrado, etc.)           |

**Decisão consolidada:** **5 tipos de meta, 3 períodos, 3 escopos (individual + loja + global; equipe dormente), cálculo em runtime via hooks, dashboard duplo (individual vs agregado), gráfico evolutivo, audit em mudanças de target.**

---

## Escopo

### Incluído

- ✅ Modelo `IGoal`, `IGoalProgress`, `GoalType`, `GoalScope`, `GoalPeriod`, `GoalStatus` em `src/shared/types/goals.ts`
- ✅ Geradores de mock: ~25 metas (mix de tipos, escopos, períodos, status — incluindo concluídas históricas)
- ✅ Função pura `calculateGoalProgress(goal, context)` em `src/features/goals/engine/`
- ✅ Hook `useGoalProgress(goalId)` reativo a mudanças em pedidos/clientes
- ✅ Página `/app/metas` substituindo placeholder do PRD-003 com 2 dashboards (individual vs agregado conforme papel)
- ✅ Página de criação `/app/metas/nova` com 4 seções
- ✅ Página de detalhe `/app/metas/:id` com 5 seções incluindo gráfico evolutivo
- ✅ Cálculo de status visual (semáforo) baseado em ratio realizado/esperado
- ✅ Projeção de fechamento (regressão linear simples)
- ✅ Composição clicável (lista de pedidos/clientes que compõem o número)
- ✅ Filtros, busca, ordenação, URL sync
- ✅ Edição de target com audit log especial
- ✅ Sugestões inteligentes na criação (comparativo com mês anterior)
- ✅ Histórico de metas anteriores com gráfico evolutivo temporal
- ✅ Integração com PRD-014 (Painel Gestor) — widget "Metas do mês"
- ✅ Hook `useSellerGoals(sellerId)` e `useStoreGoals(storeId)` para outros PRDs consumirem
- ✅ Permissões granulares por papel
- ✅ Audit log em criação, edição (especialmente target), arquivamento, cancelamento
- ✅ Notificações: marco 50% atingido, 80% atingido, 100% atingido (toast no MVP)
- ✅ Status automático: meta vira `concluida` quando period termina E percentage ≥ 100; `arquivada` se period termina sem 100%

### Excluído

- ❌ Metas por equipe — equipes dormentes no MVP
- ❌ Cascata de metas (meta da loja → meta dos vendedores) — Fase 2
- ❌ Metas com peso/prioridade — Fase 2
- ❌ Cálculo de comissão baseado em metas — PRD-047
- ❌ Sistema de gamificação completo (badges, conquistas) — PRD-043
- ❌ Notificações push/email — Fase 2 (apenas toast)
- ❌ Metas com sub-objetivos (meta de faturamento composta de várias categorias) — Fase 2
- ❌ Forecasting avançado com ML — Fase 2
- ❌ A/B testing de configurações de meta — Fase 2
- ❌ Comparativo entre vendedores em tempo real (ranking) — PRD-043
- ❌ Export para PDF/Excel — Fase 2

---

## Requisitos Funcionais

### Modelo e mocks

- **RF-001:** Adicionar `IGoal`, `IGoalProgress`, types em `src/shared/types/goals.ts`.
- **RF-002:** Geradores de mock (PRD-004 update): ~25 metas:
  - 8 ativas mensais (mix de tipos, mix de vendedores)
  - 4 ativas trimestrais
  - 1 ativa anual
  - 10 concluídas/arquivadas históricas (últimos 6 meses)
  - 2 canceladas
- **RF-003:** Targets realistas baseados em dados dos mocks (somar pedidos médios da loja).

### Engine de cálculo

- **RF-004:** Criar `calculateGoalProgress(goal, context): IGoalProgress` em `src/features/goals/engine/calculate.ts`.
- **RF-005:** Função pura — recebe goal + context (orders, customers da loja); retorna progress derivado.
- **RF-006:** Implementar lógica para 5 tipos (faturamento, ticket_medio, quantidade_pedidos, positivacao, novos_clientes).
- **RF-007:** Helper `computeStatusFromProgress(percentage, daysRatio): IGoalProgress['status']`:
  - `concluida`: percentage ≥ 100
  - `no_caminho`: percentage ≥ daysRatio \* 100
  - `atencao`: percentage ≥ daysRatio \* 70
  - `atrasada`: caso contrário
- **RF-008:** Helper `computeProjection(currentValue, daysPassed, totalDays): number`:
  - Regressão linear simples: `currentValue * (totalDays / daysPassed)` se daysPassed > 0
  - Capear projeção em 200% do target para evitar números absurdos

### Hooks reativos

- **RF-009:** Criar `useGoalProgress(goalId)` em `src/features/goals/hooks/`:
  - Consome orders e customers via providers
  - Calcula progress em tempo real
  - Memoriza com `useMemo` por dependências
  - Atualiza quando real-time do PRD-010 dispara
- **RF-010:** Criar `useSellerGoals(sellerId)` e `useStoreGoals(storeId)` — listas filtradas para outros PRDs.

### Página `/app/metas`

- **RF-011:** Criar `GoalsPage` em `src/features/goals/pages/`, rota `/app/metas` substituindo placeholder do PRD-003.
- **RF-012:** Renderização condicional por papel:
  - **Vendedor**: dashboard individual (cards de suas metas)
  - **Gestor/Owner**: dashboard agregado (KPIs + tabela + gráficos)
- **RF-013:** Dashboard individual:
  - Saudação + contador "Você tem N metas ativas"
  - Grid de cards (responsivo: 1 col mobile, 2-3 desktop)
  - Cada card: nome, tipo (badge), barra de progresso grande, currentValue / targetValue, %, dias restantes, recompensa (se houver), botão "Ver detalhes"
  - Cores semânticas do semáforo
- **RF-014:** Dashboard agregado (Gestor/Owner):
  - **KPIs topo**:
    - Total metas ativas
    - % média de atingimento
    - Vendedores ≥ 100% (heroes)
    - Vendedores < 70% (atenção)
  - **Filtros**: tipo, escopo, status, vendedor, loja (Owner), período
  - **Tabela**: colunas conforme "Listagem" + ações (visualizar, editar, arquivar)
  - **Gráfico**: bar chart de % atingido por vendedor (Recharts)

### Criação `/app/metas/nova`

- **RF-015:** Criar `NewGoalPage` em `/app/metas/nova` (Owner/Gestor).
- **RF-016:** 4 seções com formulário:
  - **Configuração**: tipo (5 opções com tooltips explicativos), período (3 opções), datas (auto-preenchidas), nome (autogerado)
  - **Escopo**: radio individual/loja/global; se Individual, dropdown vendedor; se Loja, dropdown loja (Owner) ou locked (Gestor)
  - **Valor**: input target com formatação BRL para faturamento/ticket_medio, número para os demais
  - **Recompensa**: textarea opcional
- **RF-017:** Sugestões inteligentes:
  - Quando seleciona vendedor + tipo, calcular meta do período anterior e mostrar: "Mês anterior: R$ X (alcançou Y%)"
  - Sugerir target = `previousValue * 1.05` (5% de crescimento) como valor inicial
- **RF-018:** Comparativo: "Esta meta é X% maior que a anterior" (visual com seta)
- **RF-019:** Botões: "Salvar rascunho" (status `arquivada` inicial), "Criar e ativar" (status `ativa`).
- **RF-020:** Audit log na criação.

### Detalhe `/app/metas/:id`

- **RF-021:** Criar `GoalDetailPage` com `DetailLayout`.
- **RF-022:** 5 seções:

**Header:**

- Nome grande, tipo (badge), escopo (avatar do vendedor ou loja), datas
- Status badge prominente (cor do semáforo)
- Ações: Editar (Owner/Gestor), Arquivar, Cancelar (com motivo)

**Resumo de progresso:**

- Barra de progresso grande com gradient
- Valor atual em destaque (formatado)
- Target em referência
- % atingido em fonte grande
- Status visual (semáforo)
- "Mantendo este ritmo, projeção: R$ X (Y% da meta)"
- Dias restantes (com indicador de urgência se < 5)

**Gráfico evolutivo:**

- Recharts LineChart 7-30 pontos (1 por dia ou semana conforme período)
- Linha 1: realizado (cor da marca, cheia)
- Linha 2: esperado proporcional (cinza tracejado)
- Tooltip: data, valor realizado, valor esperado, diferença

**Composição:**

- Para `faturamento`: tabela paginada de pedidos contribuintes (link para PRD-032)
- Para `positivacao`: lista de clientes positivados no período (link para PRD-012)
- Para `novos_clientes`: lista de clientes adquiridos
- Para `ticket_medio`: estatísticas (min, max, mediana, desvio) + gráfico de distribuição
- Para `quantidade_pedidos`: lista de pedidos

**Histórico:**

- Audit log filtrado por goal.id
- Eventos: criação, mudanças de target, status changes, arquivamento

### Edição de meta

- **RF-023:** Modal `<EditGoalModal>` chamado do botão "Editar":
  - Permite mudar: nome, target, recompensa
  - **NÃO permite mudar**: tipo, escopo, sellerId, period (criar nova meta para isso)
- **RF-024:** Mudança de target gera audit log **especial** (action='goal_target_change') com before/after — visível no histórico e impacta cálculos de comissão (PRD-047) futuros.
- **RF-025:** Aviso ao Owner: "Mudança de target em meta ativa impacta comissões a partir desta data. Comissões já calculadas permanecem inalteradas."

### Status automático e transições

- **RF-026:** Hook `useGoalAutoStatusUpdate()` roda diariamente (ou ao mudar de mês):
  - Para metas com `endDate < now` e status='ativa':
    - Se `percentage ≥ 100`: status → `concluida`
    - Senão: status → `arquivada`
  - Audit log
- **RF-027:** Vendedor é notificado (toast) quando atinge 50%, 80% e 100%:
  - "🎯 Você atingiu 50% da meta [nome]!"
  - "🚀 80% — falta pouco!"
  - "🏆 Parabéns! Meta [nome] atingida!"
- **RF-028:** Threshold em `IPlatformSettings.goalMilestoneThresholds` (configurável; default `[0.5, 0.8, 1.0]`).

### Integração com PRD-014

- **RF-029:** Atualizar PRD-014 (Painel do Gestor) adicionando widget "Metas do mês":
  - Lista compacta de metas ativas da loja
  - Cada item: nome, % atingido, barra mini
  - Click leva para `/app/metas/:id`

### Hooks consumíveis por outros PRDs

- **RF-030:** Exportar:
  - `useSellerGoals(sellerId)`: lista de metas do vendedor (ativas + concluídas no período atual)
  - `useStoreGoals(storeId)`: idem para loja
  - `useGoalsStatistics(filters)`: KPIs agregados (% médio, total, etc.)
- **RF-031:** Estes hooks são consumidos por PRDs 043 (Gamificação) e 047 (Comissões) no futuro.

### Permissões

- **RF-032:** **Vendedor**: dashboard individual; click em detalhe (suas metas); sem editar nem criar.
- **RF-033:** **Gestor**: dashboard agregado da loja; criar/editar metas da loja; arquivar; ver detalhes.
- **RF-034:** **Owner**: tudo cross-store.

### Audit log

- **RF-035:** Audit em:
  - Criação (`action='goal_create'`)
  - Edição genérica (`action='goal_update'`)
  - Mudança de target (`action='goal_target_change'` com before/after) — destacado
  - Mudança de status manual (`action='goal_status_change'`)
  - Arquivamento (`action='goal_archive'`)
  - Cancelamento (`action='goal_cancel'` com motivo)
  - Status automático (`action='goal_auto_archive'`, `goal_auto_complete'`)

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** `calculateGoalProgress` < 50ms mesmo com 100 pedidos no período.
- **RNF-002 (Reatividade):** Mudanças em pedidos refletem em progresso em < 200ms.
- **RNF-003 (Memorização):** Cálculos memoizados por dependências (mudanças nos pedidos disparam recalculo).
- **RNF-004 (Acessibilidade):** WCAG 2.1 AA; gráficos com tabela alternativa.
- **RNF-005 (Responsividade):** Mobile usável; cards stack vertical; tabela com scroll horizontal.
- **RNF-006 (Tipagem):** Zero `any`; union literals para types.

---

## Critérios de Aceitação

### Dashboard individual (vendedor)

```gherkin
DADO Vendedor Carlos com 3 metas ativas
QUANDO acessa /app/metas
ENTÃO vê 3 cards (uma por meta)
  E cada card mostra barra de progresso, valor atual/target, % e dias restantes
  E NÃO vê dashboard agregado nem outras metas

DADO Carlos sem metas ativas
QUANDO acessa /app/metas
ENTÃO vê EmptyState: "Você ainda não tem metas ativas — fale com seu gestor"
```

### Dashboard agregado (Gestor/Owner)

```gherkin
DADO Gestor Marina com 12 metas ativas na loja
QUANDO acessa /app/metas
ENTÃO vê KPIs no topo (total, % média, heroes, atenção)
  E tabela com 12 metas filtráveis
  E bar chart com progresso por vendedor

DADO aplico filtro Tipo=faturamento, Status=ativa
QUANDO filtros aplicam
ENTÃO tabela mostra apenas metas de faturamento ativas
  E URL atualiza
```

### Cálculo de progresso

```gherkin
DADO meta de faturamento R$ 50.000 mensal, dia 15 do mês
  E pedidos pagos no período totalizando R$ 28.000
QUANDO useGoalProgress(goalId) executa
ENTÃO retorna currentValue=28000, percentage=56, daysRatio=0.5, status='no_caminho'

DADO ratio realizado (0.56) vs esperado (0.50) > 1.0
QUANDO status calcula
ENTÃO status='no_caminho' (verde)

DADO meta de positivação 30 clientes mensal
  E 18 clientes distintos compraram no mês
QUANDO calculaProgress
ENTÃO currentValue=18, percentage=60
```

### Status automático

```gherkin
DADO meta com endDate=ontem e percentage=120
QUANDO useGoalAutoStatusUpdate roda
ENTÃO status muda para 'concluida'
  E audit log registra (action='goal_auto_complete')

DADO meta com endDate=ontem e percentage=80
QUANDO update roda
ENTÃO status muda para 'arquivada' (não atingiu)
  E audit log
```

### Notificações de marco

```gherkin
DADO Carlos atinge 50% de uma meta
QUANDO progress atualiza
ENTÃO toast aparece: "🎯 Você atingiu 50% da meta [nome]!"
  E flag isso para não notificar de novo nesse marco

DADO Carlos atinge 100%
QUANDO progress atualiza
ENTÃO toast prominente: "🏆 Parabéns! Meta [nome] atingida!"
  E animação visual (confete? — opcional)
```

### Criação

```gherkin
DADO sou Gestor e acesso /app/metas/nova
QUANDO seleciono tipo=faturamento, período=mensal, vendedor=Carlos
ENTÃO sistema sugere target baseado no mês anterior + 5%
  E mostra comparativo: "5% maior que meta anterior"

DADO crio meta com target R$ 50.000 e clico "Criar e ativar"
QUANDO save processa
ENTÃO IGoal criada com status='ativa'
  E audit log
  E navego para /app/metas/:id
  E aparece no dashboard do Carlos
```

### Edição

```gherkin
DADO sou Gestor e abro meta ativa
QUANDO clico "Editar"
ENTÃO modal abre com campos editáveis: nome, target, recompensa
  E tipo/escopo/sellerId/período locked

DADO mudo target de R$ 50.000 para R$ 60.000 e salvo
QUANDO ação processa
ENTÃO aviso: "Mudança de target impacta cálculos de comissão a partir desta data"
  E confirmo
  E audit especial: action='goal_target_change' com before/after
  E vendedor recebe notificação
```

### Cenários de erro

```gherkin
DADO tento criar meta com endDate < startDate
QUANDO validação processa
ENTÃO erro: "Data fim deve ser posterior à data início"

DADO tento criar 2 metas individuais do mesmo tipo+período para mesmo vendedor
QUANDO validação processa
ENTÃO alerta: "Já existe meta de faturamento mensal para [vendedor] em janeiro/2026"
  E pergunta se quer arquivar a anterior antes de criar nova

DADO Vendedor tenta acessar /app/metas/nova
QUANDO GuardedRoute verifica
ENTÃO redirecionado para /sem-permissao
```

---

## Fases de Implementação

| Fase | Objetivo                                                    | Arquivos Estimados |
| ---- | ----------------------------------------------------------- | ------------------ |
| 1    | Modelo, mocks, engine de cálculo, hooks reativos            | 6-7                |
| 2    | Dashboard individual + dashboard agregado                   | 5-6                |
| 3    | Criação e edição com sugestões + audit                      | 5-6                |
| 4    | Detalhe com 5 seções incluindo gráfico evolutivo            | 5-6                |
| 5    | Status automático, notificações, integração PRD-014, polish | 3-4                |

### Detalhamento das Fases

#### Fase 1: Engine

- [ ] Tipos `IGoal`, `IGoalProgress`, etc.
- [ ] Geradores de mock (~25 metas variadas)
- [ ] `calculateGoalProgress` função pura para 5 tipos
- [ ] Hooks `useGoalProgress`, `useSellerGoals`, `useStoreGoals`, `useGoalsStatistics`
- [ ] Testes manuais via console

**Validação:** chamar `calculateGoalProgress` com 5 cenários (1 por tipo) e validar saídas.

#### Fase 2: Dashboards

- [ ] `GoalsPage` com renderização condicional por papel
- [ ] Dashboard individual com cards
- [ ] Dashboard agregado com KPIs + tabela + bar chart
- [ ] Filtros + URL sync

**Validação:** Vendedor vê suas metas; Gestor vê dashboard completo da loja.

#### Fase 3: Criação e Edição

- [ ] `NewGoalPage` com 4 seções
- [ ] Sugestões inteligentes (mês anterior + 5%)
- [ ] Comparativo visual
- [ ] Modal `<EditGoalModal>` com campos restritos
- [ ] Aviso especial em mudança de target
- [ ] Audit log

**Validação:** criar meta com sugestão automática; editar target gera audit especial.

#### Fase 4: Detalhe

- [ ] `GoalDetailPage` com 5 seções
- [ ] Gráfico evolutivo (Recharts) com linha realizado vs esperado
- [ ] Composição clicável (pedidos/clientes contribuintes)
- [ ] Estatísticas para ticket_medio
- [ ] Histórico de mudanças via audit

**Validação:** detalhe completo; gráfico mostra realista; composição link funcional.

#### Fase 5: Status Automático, Notificações, Polish

- [ ] Hook `useGoalAutoStatusUpdate` rodando diariamente
- [ ] Notificações de marco (50%, 80%, 100%)
- [ ] Widget no PRD-014 (Painel Gestor)
- [ ] Mobile responsivo
- [ ] Documentação `docs/goals.md`

**Validação:** metas vencidas mudam status automaticamente; widget aparece no painel; notificações funcionam.

---

## Dependências

### PRDs Anteriores

| PRD                                               | Status      |
| ------------------------------------------------- | ----------- |
| PRD-002 (IGoal modelado)                          | 📝 Redigido |
| PRD-005 (Provider)                                | 📝 Redigido |
| PRD-006 (RBAC)                                    | 📝 Redigido |
| PRD-007 (multi-loja)                              | 📝 Redigido |
| PRD-014 (widget adicionado)                       | 📝 Redigido |
| PRD-015 (lista clientes — novos_clientes consome) | 📝 Redigido |
| PRD-032 (Pedido — alimenta faturamento)           | 📝 Redigido |

### Dependências Futuras

| PRD                   | Como Lidar                                                      |
| --------------------- | --------------------------------------------------------------- |
| PRD-043 (Gamificação) | Consome `useGoalProgress`                                       |
| PRD-047 (Comissões)   | Consome `useGoalProgress` + mudança de target dispara reCálculo |

### Decisões Pendentes

Nenhuma.

---

## Cadeia de PRDs

| Ordem  | PRD                              | Status       |
| ------ | -------------------------------- | ------------ |
| 1-19   | PRDs 010-033                     | 📝           |
| **20** | **PRD-042**                      | **🔄 ATUAL** |
| 21+    | PRDs 043-046 (Gestão A)          | ⏳           |
| Demais | Gestão B, E-commerce, Auxiliares | ⏳           |

---

## Considerações de Segurança

### Mudança de target afeta comissões

Audit especial obrigatório. Aviso visível ao Owner antes de confirmar. PRD-047 (Comissões) usa o snapshot da meta no momento do pagamento — mudanças retroativas não afetam pagamentos passados.

### Permissões granulares

Gestor não cria metas em outras lojas. Owner com permission cross-store pode. Vendedor nunca edita.

### Notificações de marco

Toast simples no MVP. Fase 2 com push pode levar notificação ao celular do vendedor.

---

## Fluxos de Usuário

### Fluxo Principal — Gestor cria meta mensal

1. Marina (Gestor) acessa `/app/metas/nova`
2. Seleciona tipo=faturamento, período=mensal
3. Datas auto-preenchem (1-31 de janeiro)
4. Escolhe escopo=individual, vendedor=Carlos
5. Sistema sugere target R$ 52.500 (mês anterior R$ 50k + 5%)
6. Marina aceita sugestão
7. Adiciona recompensa: "Bônus de R$ 500 ao atingir"
8. Clica "Criar e ativar"
9. Audit log gerado
10. Carlos recebe toast: "Você tem nova meta: Faturamento Janeiro 2026 — R$ 52.500"

### Fluxo Vendedor monitorando

1. Carlos abre `/app/metas` na manhã do dia 20
2. Vê 3 cards: faturamento (62%), positivação (85%), ticket_medio (45%)
3. Identifica ticket_medio atrasado (vermelho)
4. Clica para detalhar
5. Vê estatísticas: ticket atual médio R$ 800, target R$ 1.000
6. Identifica que precisa fechar pedidos maiores
7. Foca em B2B nos próximos dias

### Fluxo Marco 100%

1. Carlos fecha pedido de R$ 10k dia 28
2. Progresso de faturamento sobe para 102%
3. Toast: "🏆 Parabéns! Meta Faturamento Janeiro atingida!"
4. No detalhe, status vira "Concluída" antes do fim do período
5. Mês fechar: status_auto_update mantém como `concluida`

### Fluxo Owner ajusta target em meta ativa

1. João Gallo decide aumentar target da loja por crescimento inesperado
2. Acessa meta da loja em /app/metas/:id
3. Clica "Editar" → modal
4. Muda target de R$ 200k para R$ 250k
5. Aviso: "Mudança de target impacta comissões a partir desta data..."
6. Confirma
7. Audit especial registrado
8. Vendedores da loja recebem notificação
9. Cálculos a partir deste momento usam novo target

---

## Convenções de Código

| Elemento        | Convenção             | Exemplo                                                                   |
| --------------- | --------------------- | ------------------------------------------------------------------------- |
| **Página**      | PascalCase + `Page`   | `GoalsPage`, `GoalDetailPage`, `NewGoalPage`                              |
| **Componentes** | PascalCase            | `<GoalCard>`, `<GoalProgressBar>`, `<EditGoalModal>`                      |
| **Hooks**       | camelCase + `use`     | `useGoalProgress`, `useSellerGoals`, `useGoalAutoStatusUpdate`            |
| **Engine**      | camelCase função pura | `calculateGoalProgress`, `computeStatusFromProgress`, `computeProjection` |
| **Pasta**       | kebab-case            | `goals/`, `engine/`, `hooks/`                                             |
| **Git commits** | Conventional          | `feat(goals): add goal management with progress tracking`                 |

---

## Notas para o Agente Desenvolvedor

### Princípios

| Princípio                               | Descrição                                                  |
| --------------------------------------- | ---------------------------------------------------------- |
| **5 tipos cobrem o essencial**          | Faturamento + ticket + volume + positivação + aquisição    |
| **Equipes dormentes**                   | Apenas individual e loja no MVP                            |
| **Cálculo em runtime via hooks**        | Memoizar para evitar recomputo; reativo a mudanças         |
| **Projeção é simples**                  | Regressão linear básica; ML na Fase 2                      |
| **Mudança de target tem custos**        | Audit especial; aviso explícito sobre comissões            |
| **Vendedor vê só suas metas**           | Dashboard individual; sem comparação direta (vira PRD-043) |
| **Status automático no fim do período** | Concluída ou Arquivada conforme atingimento                |

### O que NÃO Fazer

| ❌ Evitar                                               |
| ------------------------------------------------------- |
| Implementar metas por equipe (dormentes no MVP)         |
| Implementar gamificação (badges, ranking) — PRD-043     |
| Calcular comissões aqui — PRD-047                       |
| Permitir Vendedor criar/editar metas                    |
| Esquecer audit especial em mudança de target            |
| Forecasting complexo com ML — Fase 2                    |
| Calcular progresso de forma síncrona pesada — usar memo |
| Permitir mudar tipo/escopo/seller após criação          |
| Esquecer notificações de marco                          |
| Cards estáticos sem progresso reativo                   |

---

## Status de Implementação

| Campo      | Valor       |
| ---------- | ----------- |
| **Status** | ⏳ PENDENTE |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                                                |
| ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — sistema de metas com 5 tipos, 3 escopos, 3 períodos, tracking em tempo real, dashboard duplo, gráfico evolutivo, notificações de marco |

---

**AILA - Sistemas Inteligentes**
