# PRD-049: Rentabilidade

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _A definir após criação no Lovable_ |
| **Objetivo** | Construir análise de rentabilidade multidimensional — margem por produto, categoria, cliente, vendedor — identificar pontos críticos (margem negativa) e oportunidades (top margens), com drill-down cruzado |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 4 |
| **Prioridade** | Alta |
| **Épico** | Bloco 4b — Gestão B (Onda 2) |
| **PRDs Relacionados** | PRD-030 (Catálogo — unitCost), PRD-032 (Pedido), PRD-040 (Cockpit), PRD-041 (Vendas), PRD-045 (ABC), PRD-048 (DRE) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Feature-based; código em `src/features/profitability/` |

### Critérios de Complexidade

> **Justificativa de Alta:** análise multi-dimensional (produto / categoria / cliente / vendedor / marca), cálculos derivados por item de pedido (precisa unitCost de cada peça vendida), identificação de pontos críticos (margem < threshold ou negativa), top margens em cada dimensão, drill-down cruzado (cliente X em produto Y), e integração transversal com 5+ PRDs.

---

## Contexto do Problema

PRD-048 (DRE) mostra margem agregada da empresa. Mas Owner precisa **drill-down**:

**Qual produto dá mais margem?** Filtro óleo vende muito, mas margem é boa? Sem análise por produto, decisões de mix viram intuição. **Qual cliente compra com mais margem?** Cliente A pode ser top em volume mas margem ruim (sempre negocia desconto). Cliente B menor volume, melhor margem. Identificar isso muda estratégia comercial. **Quais vendedores dão margens piores?** Vendedor que abusa de desconto custa caro a longo prazo.

Este PRD entrega: análise multidimensional de margem com drill-downs cruzados, identificação proativa de pontos críticos.

---

## Conceito da Solução

### Cálculo de margem por item

Para cada `IOrderItem` em pedidos pagos:

```typescript
itemRevenue = quantity * (unitPrice - itemDiscount)
itemCost = quantity * partUnitCost  // do PRD-030
itemMargin = itemRevenue - itemCost
itemMarginPct = itemMargin / itemRevenue (× 100)
```

Se `partUnitCost` não definido, item conta para "Sem dados de custo".

### Página `/app/rentabilidade`

Header: filtros (período, loja, vendedor, categoria, marca).

### 4 abas

1. **Por Produto** — top margens / produtos críticos
2. **Por Categoria** — agrupamento de produtos
3. **Por Cliente** — quais clientes geram mais margem
4. **Por Vendedor** — comparativo de margens entre vendedores

### Aba 1 — Por Produto

KPIs no topo:
- Margem média (%)
- Cobertura de custo (% de produtos com unitCost)
- Produtos com margem negativa (contagem)
- Top produto (maior margem absoluta)

Tabela top 30:
- Produto + OEM
- Receita, custo, margem (R$ e %)
- Indicador visual:
  - 🟢 Margem ≥ 35%
  - 🟡 25-35%
  - 🔴 < 25% ou negativa

Filtro extra: "Apenas margens negativas" / "Sem custo cadastrado".

### Aba 2 — Por Categoria

Bar chart de margem média por categoria + tabela com:
- Categoria
- Receita
- Custo
- Margem R$ e %
- N produtos
- Tendência vs período anterior

### Aba 3 — Por Cliente

Tabela top clientes por margem:
- Cliente (link PRD-012) + classe ABC (PRD-045)
- Receita
- Custo dos itens
- Margem R$ e %
- Indicador (verde/amarelo/vermelho)
- Vendedor responsável

Inclui filtro especial "Clientes com margem negativa" — útil para identificar contas que custam dinheiro.

### Aba 4 — Por Vendedor

Tabela comparativa:
- Vendedor
- Receita gerada
- Margem total (R$)
- Margem média (%)
- Desconto médio aplicado
- Indicador comparativo

Identifica vendedores com tendência a vender com margem baixa (excesso de desconto).

### Alertas

Banner no topo:
- "X produtos com margem negativa" (vermelho)
- "Cobertura de custo é Y% — atualize unitCost no catálogo" (amarelo se < 80%)
- "Top vendedor com menor margem: [nome] — Z% (média loja: W%)"

### Drill-downs cruzados

- Click em produto → ficha PRD-030 + sugestão "Aumentar preço?" (placeholder Fase 2)
- Click em cliente → ficha PRD-012 com tab Rentabilidade
- Click em vendedor → drill-down próprio
- Filtro combinado: cliente X em categoria Y permite cross-análise

### Permissões

- **Owner**: tudo
- **Gestor**: loja
- **Financeiro**: read-only consolidado
- **Vendedor**: SEM ACESSO (informação estratégica)

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|---------------------|
| Análise apenas no DRE (PRD-048) | DRE é agregado; drill-down é o valor |
| Apenas por produto (sem cliente/vendedor) | Cliente e vendedor são dimensões críticas |
| Sem alertas | Owner descobre tarde |
| Vendedor vê suas margens | Sensível demais; conflito com gestão de descontos |
| Sem cobertura de custo | Owner toma decisão sobre dados parciais sem saber |

---

## Escopo

### Incluído

- ✅ Engine `calculateProfitability(period, dimension, context)` em `src/features/profitability/engine/`
- ✅ Página `/app/rentabilidade` com 4 abas
- ✅ KPIs e indicadores visuais por dimensão
- ✅ Tabelas top 30 com filtros
- ✅ Identificação de margem negativa em todas dimensões
- ✅ Drill-downs cruzados para PRDs 030/012
- ✅ Hook `useProfitabilityMetrics(filters, dimension)` consumido por PRD-040 (cockpit) e PRD-041 (vendas)
- ✅ Banner de alertas (margem negativa, cobertura)
- ✅ Filtros + URL sync
- ✅ Permissões (Vendedor bloqueado)
- ✅ Mobile responsivo

### Excluído

- ❌ Sugestão automática de aumento de preço — Fase 2
- ❌ Análise de elasticidade preço-demanda — Fase 2
- ❌ Análise por canal (SDR vs Manual) — pode incluir simples mas evolução Fase 2
- ❌ Forecast de margem — Fase 2
- ❌ Export PDF — Fase 2

---

## Requisitos Funcionais

### Engine

- **RF-001:** `calculateProfitability(period, dimension, context)`:
  - dimension: 'product' | 'category' | 'customer' | 'seller'
  - Itera sobre orderItems de pedidos pagos no período
  - Agrupa por dimensão
  - Calcula revenue, cost, margin, marginPct por grupo
- **RF-002:** `calculateCoverage(orderItems)`: % de items com partUnitCost definido.
- **RF-003:** Hooks `useProductProfitability`, `useCategoryProfitability`, `useCustomerProfitability`, `useSellerProfitability`.

### Página

- **RF-004:** `ProfitabilityPage` em `src/features/profitability/pages/`, rota `/app/rentabilidade`.
- **RF-005:** Tabs com 4 abas.
- **RF-006:** Filtros header: período (mês default), loja (Owner), vendedor, categoria, marca.
- **RF-007:** URL sync.

### Aba Produto

- **RF-008:** KPIs: margem média, cobertura, produtos negativos, top produto.
- **RF-009:** Tabela top 30 com colunas conforme conceito.
- **RF-010:** Indicador visual de margem (verde/amarelo/vermelho) com thresholds configuráveis.
- **RF-011:** Filtros extras: "Apenas margens negativas", "Sem custo cadastrado".
- **RF-012:** Click em produto → ficha PRD-030.

### Aba Categoria

- **RF-013:** Bar chart de margem média por categoria.
- **RF-014:** Tabela com colunas conforme conceito + tendência vs período anterior.

### Aba Cliente

- **RF-015:** Tabela top clientes por margem.
- **RF-016:** Incluir badge classe ABC (PRD-045).
- **RF-017:** Filtro "Clientes com margem negativa".
- **RF-018:** Click em cliente → ficha PRD-012.

### Aba Vendedor

- **RF-019:** Tabela comparativa.
- **RF-020:** Indicador de desconto médio aplicado.
- **RF-021:** Identificação visual de vendedores em alerta (margem < media - desvio).

### Alertas

- **RF-022:** Hook `useProfitabilityAlerts(filters)`:
  - Produtos com margem negativa
  - Cobertura < 80%
  - Vendedor com margem significativamente abaixo da média
- **RF-023:** Banner colorido por severidade.

### Cobertura de custo

- **RF-024:** Indicador prominente no header: "Análise baseada em X% dos itens (Y peças sem custo)".
- **RF-025:** Click leva à lista de peças sem unitCost no catálogo.

### Permissões

- **RF-026:** `<GuardedRoute>` bloqueia Vendedor.
- **RF-027:** Gestor: loja read-only.
- **RF-028:** Owner/Financeiro: tudo.

---

## Requisitos Não-Funcionais

- **RNF-001:** Cálculo de rentabilidade por dimensão < 400ms.
- **RNF-002:** Memorização agressiva (cálculos pesados).
- **RNF-003:** Mobile com scroll horizontal.
- **RNF-004:** WCAG 2.1 AA.

---

## Critérios de Aceitação

```gherkin
DADO 120 pedidos pagos no período
  E 80% dos items têm partUnitCost cadastrado
QUANDO calculateProfitability(period, 'product') executa
ENTÃO agrega por produto
  E para cada produto: revenue, cost, margin, marginPct
  E cobertura reportada como 80%

DADO Owner acessa /app/rentabilidade aba Produto
QUANDO observa
ENTÃO vê top 30 produtos
  E filtra "margem negativa" → lista de produtos críticos
  E click em produto leva à ficha PRD-030

DADO cliente Aurora com 30 pedidos no período
  E margem média = -2% (negativa)
QUANDO observo aba Cliente
ENTÃO Aurora aparece com indicador vermelho
  E em "Clientes com margem negativa" se filtro

DADO Vendedor tenta acessar /app/rentabilidade
QUANDO GuardedRoute valida
ENTÃO bloqueado (redirecionado)
```

---

## Fases de Implementação

| Fase | Objetivo |
|------|----------|
| 1 | Engine + hooks por dimensão |
| 2 | Aba Produto + Aba Categoria |
| 3 | Aba Cliente + Aba Vendedor |
| 4 | Alertas + drill-downs + polish |

---

## Dependências

| PRD | Status |
|-----|--------|
| PRD-030 (unitCost) | 📝 (atualizado em PRD-048) |
| PRD-032 (orderItems) | 📝 |
| PRD-040 (consome hook) | 📝 |
| PRD-045 (classe ABC) | 📝 |
| PRD-048 (consome também) | 📝 (lote atual) |

---

## Cadeia

| Ordem | PRD |
|-------|-----|
| 1-28 | 010-048 |
| **29** | **PRD-049 ATUAL** |
| 30+ | 050-053 |

---

## Considerações de Segurança

- Dados de custo são sensíveis — Vendedor BLOQUEADO totalmente
- Análise por vendedor expõe performance comparativa — Gestor/Owner only
- Cobertura de dados informada explicitamente (transparência)

---

## Convenções

| Elemento | Convenção |
|----------|-----------|
| Página | `ProfitabilityPage` |
| Engine | `calculateProfitability` |
| Hook | `useProductProfitability`, etc. |
| Pasta | `profitability/` |

---

## Notas para o Agente Desenvolvedor

- Drill-downs cruzados são o destaque — cada elemento clicável
- Vendedor BLOQUEADO (informação estratégica de custos)
- Cobertura de custo essencial — sem isso, dados enganam
- Reusar componentes de tabela dos PRDs 015/032 (consistência visual)
- Indicadores de margem com thresholds claros (verde/amarelo/vermelho)

---

## Status

| Campo | Valor |
|-------|-------|
| Status | ⏳ PENDENTE |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 25/05/2026 | v1 | Criação inicial — rentabilidade multidimensional por produto/categoria/cliente/vendedor |

---

**AILA - Sistemas Inteligentes**
