# PRD-044: Positivação

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                 |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                                      |
| **Objetivo**          | Construir o sistema de positivação — métricas de quais clientes compraram no período, drill-down por vendedor, projeção de fechamento mensal, identificação de clientes "no limite" e integração com metas/painel gestor |
| **Tipo**              | Feature                                                                                                                                                                                                                  |
| **Complexidade**      | Média                                                                                                                                                                                                                    |
| **Total de Fases**    | 4                                                                                                                                                                                                                        |
| **Prioridade**        | Alta                                                                                                                                                                                                                     |
| **Épico**             | Bloco 4a — Gestão A (Onda 2)                                                                                                                                                                                             |
| **PRDs Relacionados** | PRD-012 (Ficha), PRD-014 (Painel Gestor), PRD-015 (Lista Clientes), PRD-032 (Pedido), PRD-042 (Metas), PRD-046 (Carteira)                                                                                                |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                       |
| **Padrão de código**  | Feature-based; código em `src/features/positivation/`                                                                                                                                                                    |

### Critérios de Complexidade

> **Justificativa de Média:** cálculo derivado simples (clientes distintos com pedido pago no período), 4 visualizações (KPIs, tabela de clientes, drill-down por vendedor, gráfico evolutivo), filtros combinados, integração com hooks de outros PRDs, sem mutations próprias (apenas leitura derivada).

---

## Contexto do Problema

Positivação é métrica central de **cobertura de carteira**. Hoje sem painel dedicado:

**Vendedor não sabe quem ele ainda não atendeu este mês.** Lista de 100 clientes na carteira — quais compraram? Quais ainda não? Sem visão, vendedor foca em quem é mais fácil. **Gestor não vê tendência.** "Estamos positivando 60% ou 80% da base?" — sem métrica diária, descobre tarde. **Meta de positivação (PRD-042) precisa visualização própria.** PRD-042 calcula `positivacao` mas precisa de drill-down: quem positivou? Quem falta?

Este PRD entrega: painel dedicado, lista navegável de positivados/não-positivados, drill-down por vendedor, projeção de fechamento, identificação de clientes no limite (perto de virar dormentes).

---

## Conceito da Solução

### Definição

**Cliente positivado no período X** = cliente com pelo menos 1 `IOrder` com `paymentStatus='paid'` cujo `paidAt` está dentro de X.

### Métricas

```typescript
IPositivationMetrics {
  period: { start: ISO8601; end: ISO8601 };
  totalCustomers: number;          // base elegível (clientes ativos)
  positivatedCount: number;        // distinct customerId com pedido pago no período
  positivationRate: number;        // positivatedCount / totalCustomers (0-1)
  projection: number;              // projeção fim do mês baseada em ritmo
  byseller: ISellerPositivation[]; // breakdown por vendedor
  notPositivated: ICustomer[];     // clientes que ainda não compraram
  atRisk: ICustomer[];             // perto de virar dormentes (próximos 15 dias)
}

ISellerPositivation {
  sellerId: ID;
  customersInPortfolio: number;
  positivatedCount: number;
  rate: number;
  projection: number;
}
```

### Página `/app/positivacao`

**Header**: filtros (período, vendedor, loja Owner)

**KPIs no topo:**

- Total clientes base
- Positivados
- Taxa de positivação (%)
- Projeção fim do mês (com indicador de tendência)
- Clientes em risco (próximos 15 dias para virar dormentes)

**Gráfico de evolução**: linha mostrando positivação acumulada vs proporcional do período (Recharts).

**Tabela "Por vendedor"** (Gestor/Owner):

- Avatar + nome
- Clientes na carteira
- Positivados
- Taxa de positivação
- Projeção
- Click leva para drill-down

**Lista de clientes não-positivados** (paginada):

- Avatar + nome + última compra (com indicador de tempo)
- Botão "Contatar" (placeholder — abre conversa via PRD-010/011)
- Filtros: classe ABC (PRD-045), tempo desde última compra

**Lista de clientes em risco** (próximos 15 dias para virar dormentes):

- Mesma estrutura, com badge "⚠ Em risco"

### Integração com PRD-042 (Metas)

- Meta de tipo `positivacao` consome `currentValue = positivatedCount` deste PRD
- Hook `usePositivationMetrics` exportado para PRD-042 calcular progresso

### Integração com PRD-014 (Painel Gestor)

Widget "Positivação do mês" no painel:

- KPI compacto: "X% positivado (Y/Z)"
- Mini-barra de progresso
- Click leva ao `/app/positivacao`

### Integração com PRD-015 (Lista de Clientes)

Filtro adicional na lista: "Positivado este mês" / "Não positivado este mês".

### Drill-down `/app/positivacao/:sellerId`

Página de drill-down individual (Vendedor vê só a si; Gestor vê qualquer da loja):

- Header: nome do vendedor, KPIs (carteira, positivados, taxa, projeção)
- Lista completa de clientes da carteira com colunas: nome, classe ABC, última compra, valor último pedido, status (positivado ✓ / pendente)
- Filtros e ordenação

### Permissões

- **Owner**: tudo cross-store
- **Gestor**: loja
- **Vendedor**: só seus próprios dados (sem drill-down de colegas)

### Alternativas Consideradas

| Alternativa                         | Por que descartada                      |
| ----------------------------------- | --------------------------------------- |
| Apenas KPI no painel sem drill-down | Vendedor precisa saber QUEM falta       |
| Sem projeção                        | Reação tardia                           |
| Sem "em risco"                      | Oportunidade de ação preventiva perdida |
| Cálculo por mutation                | Reativo é mais simples                  |

---

## Escopo

### Incluído

- ✅ Modelo `IPositivationMetrics`, `ISellerPositivation`
- ✅ Engine `calculatePositivation(period, context)` em `src/features/positivation/engine/`
- ✅ Página `/app/positivacao` substituindo placeholder do PRD-003
- ✅ KPIs no topo, gráfico evolutivo (Recharts), tabela por vendedor (Gestor/Owner), lista não-positivados, lista em risco
- ✅ Drill-down `/app/positivacao/:sellerId`
- ✅ Hook `usePositivationMetrics(filters)` consumido por PRD-042 e PRD-014
- ✅ Widget no Painel Gestor (PRD-014)
- ✅ Filtros + URL sync
- ✅ Botão "Contatar" placeholder (abre conversa)
- ✅ Lista de clientes em risco (próximos 15 dias para dormente baseado em `lifecycleThresholds`)
- ✅ Permissões granulares

### Excluído

- ❌ Workflow automatizado de contato em massa — Fase 2
- ❌ Sugestões de IA sobre o que oferecer ao não-positivado — Fase 2
- ❌ Notificações automáticas ao vendedor — Fase 2
- ❌ Comparativo cross-mês na mesma tela — incluído via gráfico evolutivo
- ❌ Export PDF/CSV — Fase 2

---

## Requisitos Funcionais

### Engine

- **RF-001:** `calculatePositivation(period, context)` função pura.
- **RF-002:** Calcula: positivatedCount via `new Set(orders.filter(paid && inPeriod).map(o => o.customerId)).size`.
- **RF-003:** Calcula projeção: `positivatedCount * (totalDays / daysPassed)`, capeado.
- **RF-004:** Calcula `atRisk`: clientes cujo `lastOrderDate + lifecycleThresholds.dormantDays - now < 15`.
- **RF-005:** Breakdown por vendedor: agrupa por `customer.sellerId`.

### Página

- **RF-006:** `PositivationPage` em `src/features/positivation/pages/`, rota `/app/positivacao`.
- **RF-007:** Filtros: período (mês atual default; mês anterior; trimestre; ano; personalizado), vendedor (Gestor/Owner), loja (Owner).
- **RF-008:** KPIs: total base, positivados, taxa, projeção, em risco. Cada KPI com tendência (vs período anterior).
- **RF-009:** Gráfico Recharts: linha cumulativa de positivação vs proporcional.
- **RF-010:** Tabela "Por vendedor" (Gestor/Owner): colunas conforme `ISellerPositivation`. Click → drill-down.
- **RF-011:** Lista paginada "Não positivados": tabela com colunas, paginação 30/página, filtros (classe ABC, tempo desde última compra).
- **RF-012:** Lista "Em risco": mesma estrutura com badge especial.
- **RF-013:** Botão "Contatar" em cada cliente: navega para `/app/atendimento` com filtro pré-aplicado por customerId, OU abre modal "Criar nova conversa" (Fase 2 — placeholder no MVP com toast).

### Drill-down

- **RF-014:** `SellerPositivationPage` em `/app/positivacao/:sellerId`.
- **RF-015:** Header: nome + KPIs do vendedor.
- **RF-016:** Tabela completa da carteira com toggle (todos / positivados / não positivados / em risco).
- **RF-017:** Ordenação por colunas.

### Integrações

- **RF-018:** Hook `usePositivationMetrics(filters)` exportado.
- **RF-019:** PRD-042 consome esse hook para metas de tipo `positivacao` (substitui cálculo interno).
- **RF-020:** Widget `<PositivationWidget>` no PRD-014.
- **RF-021:** Filtro "Positivado / Não positivado este mês" adicionado em PRD-015.

### Permissões

- **RF-022:** Vendedor: vê apenas seu drill-down. Tabela "Por vendedor" filtrada para mostrar só ele.
- **RF-023:** Gestor: vê loja.
- **RF-024:** Owner: cross-store.

---

## Requisitos Não-Funcionais

- **RNF-001:** Cálculo < 200ms para 100 clientes + 200 pedidos.
- **RNF-002:** Reativo a mudanças em pedidos.
- **RNF-003:** WCAG 2.1 AA.

---

## Critérios de Aceitação

```gherkin
DADO 70 clientes ativos na carteira do Carlos
  E 42 com pedido pago no mês
QUANDO calculatePositivation executa
ENTÃO positivatedCount=42, rate=60%, projection extrapolada

DADO Gestor acessa /app/positivacao
QUANDO vê tabela "Por vendedor"
ENTÃO vê todos os vendedores da loja com taxas e projeções

DADO Vendedor acessa /app/positivacao
QUANDO vê tabela
ENTÃO vê apenas seu próprio drill-down (não outros)

DADO cliente "Aurora" sem pedido nos últimos 75 dias
  E lifecycleThresholds.dormantDays = 90
QUANDO calcula atRisk
ENTÃO Aurora aparece na lista "em risco" (faltam 15 dias para virar dormente)

DADO clico em "Contatar" um cliente não-positivado
QUANDO ação dispara
ENTÃO sou navegado para inbox/conversa com customer pré-filtrado
  (ou modal placeholder se conversa nova precisar PRD-100)
```

---

## Fases de Implementação

| Fase | Objetivo                                                                |
| ---- | ----------------------------------------------------------------------- |
| 1    | Engine + hooks exportáveis                                              |
| 2    | Página principal (KPIs, gráfico, tabelas)                               |
| 3    | Drill-down + integrações (PRD-014 widget, PRD-015 filtro, PRD-042 hook) |
| 4    | Em risco + botão Contatar + polish                                      |

---

## Dependências

| PRD                            | Status |
| ------------------------------ | ------ |
| PRD-012 (lifecycle thresholds) | 📝     |
| PRD-014                        | 📝     |
| PRD-015                        | 📝     |
| PRD-032                        | 📝     |
| PRD-042 (consome hook deste)   | 📝     |

---

## Cadeia

| Ordem  | PRD               |
| ------ | ----------------- |
| 1-21   | 010-043           |
| **22** | **PRD-044 ATUAL** |
| 23+    | 045, 046, demais  |

---

## Considerações de Segurança

Dados sensíveis (lista de clientes não-positivados é estratégia comercial). Permissões respeitam carteira do vendedor.

---

## Convenções

| Elemento | Convenção                                    |
| -------- | -------------------------------------------- |
| Página   | `PositivationPage`, `SellerPositivationPage` |
| Engine   | `calculatePositivation`                      |
| Hook     | `usePositivationMetrics`                     |
| Pasta    | `positivation/`                              |

---

## Notas para o Agente Desenvolvedor

- Engine puro consumido por PRD-042; sem duplicação de lógica
- Lista "em risco" usa `lifecycleThresholds` configurável (PRD-019)
- Filtro em PRD-015 deve usar mesmo cálculo (consistência)
- Botão Contatar é placeholder no MVP — apenas navega para inbox

---

## Status

| Campo  | Valor       |
| ------ | ----------- |
| Status | ⏳ PENDENTE |

---

## Histórico

| Data       | Versão | Alteração                                                                              |
| ---------- | ------ | -------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — positivação com drill-down, projeção, em risco, integração com metas |

---

**AILA - Sistemas Inteligentes**
