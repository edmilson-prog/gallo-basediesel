# PRD-041: Vendas (Análise Detalhada)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _A definir após criação no Lovable_ |
| **Objetivo** | Construir análise detalhada de vendas com drill-down multidimensional — por categoria, marca, região, canal, vendedor — gráficos temporais, top produtos/clientes, sazonalidade, e funil de conversão |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | Alta |
| **Épico** | Bloco 4b — Gestão B (Onda 2) |
| **PRDs Relacionados** | PRD-017 (Pipeline Leads), PRD-030 (Catálogo), PRD-031 (Orçamento), PRD-032 (Pedido), PRD-040 (Cockpit), PRD-042 (Metas), PRD-049 (Rentabilidade) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Feature-based; código em `src/features/sales-analytics/` |

### Critérios de Complexidade

> **Justificativa de Alta:** análise multidimensional via 6 dimensões (tempo, categoria, marca, região, canal, vendedor), múltiplos gráficos (linhas, barras, áreas, treemap), top N rankings (produtos, clientes), detecção de sazonalidade básica, funil de conversão lead → orçamento → pedido, drill-down universal, e cálculos derivados pesados (precisa memorização adequada).

---

## Contexto do Problema

Owner João Gallo quer entender **a fundo** o que está vendendo:

**Qual categoria cresce mais?** Filtros estão estagnados, freios subindo? Sem visualização, decisões de estoque viram chute. **Qual marca de veículo dá mais retorno?** Volvo R450 puxa receita, Iveco encalha? Sem drill-down, mix continua arbitrário. **Quais clientes geram mais valor?** Top 10 da carteira deveriam ter tratamento especial. **Por que conversão de leads cai?** Funil sem visualização esconde gargalos.

Este PRD entrega: dashboard analítico multidimensional com drill-down, top rankings, gráfico de funil, sazonalidade detectada.

---

## Conceito da Solução

### Página `/app/vendas`

Header: filtros (período, loja Owner, vendedor, categoria, marca veículo, canal).

### 4 abas

1. **Visão Geral** — KPIs + gráficos macro
2. **Produtos** — top vendidos, performance por categoria
3. **Clientes** — top compradores, distribuição
4. **Funil** — lead → orçamento → pedido com taxas

---

### Aba 1 — Visão Geral

**KPIs no topo:**
- Faturamento total
- Pedidos pagos
- Ticket médio
- Margem média (placeholder PRD-049)

**Gráfico 1 — Faturamento ao longo do tempo:**
- Linha 12 meses
- Possível overlay de meta (PRD-042)

**Gráfico 2 — Distribuição por categoria (treemap ou bar)**:
- Filtros / freios / correias / etc.
- % da receita por categoria

**Gráfico 3 — Vendas por marca de veículo (bar)**:
- Volvo / Scania / Mercedes / Ford / Iveco
- Faturamento + número de pedidos

**Gráfico 4 — Vendas por canal/origem (pizza)**:
- SDR / Manual / Portal / E-com
- Identifica força de cada canal

**Detecção de sazonalidade**:
- Compara mês atual com mesmo mês ano anterior
- Card "Pico do período: [mês]" se variação > 25%

---

### Aba 2 — Produtos

**Top 20 produtos mais vendidos** (tabela):
- Nome + OEM + categoria
- Qtd vendida no período
- Receita gerada
- % da receita total
- Tendência (vs período anterior)

**Performance por categoria** (gráfico):
- Bar chart: receita por categoria
- Tendência (cresceu/caiu)

**Produtos em queda** (alerta):
- Lista de produtos com vendas em queda > 30%
- Útil para decisões de estoque

---

### Aba 3 — Clientes

**Top 20 clientes compradores** (tabela):
- Nome + classe ABC (PRD-045)
- Pedidos no período
- Receita total
- Ticket médio
- Vendedor responsável

**Distribuição** (gráfico):
- % concentração receita (correlato com PRD-045)

**Novos vs recorrentes**:
- Card com % de receita vinda de clientes novos vs recorrentes

---

### Aba 4 — Funil

Gráfico de funil vertical (Recharts ou custom):

```
Leads no período: 150
       ↓
Qualificados: 120 (80%)
       ↓
Orçamentos enviados: 90 (60% dos qualificados)
       ↓
Orçamentos aceitos: 50 (56% dos enviados)
       ↓
Pedidos pagos: 45 (90% dos aceitos)
```

Cada etapa mostra contagem absoluta + % de conversão da anterior.

Identificação de gargalo: etapa com queda > X% destacada.

### Drill-downs

Cada linha de tabela ou seção de gráfico permite navegação:
- Click no produto → ficha de produto (PRD-030)
- Click no cliente → ficha do cliente (PRD-012)
- Click em categoria → filtra outras abas
- Click em vendedor → ranking (PRD-043) ou drill-down próprio

### Permissões

- **Owner**: cross-store
- **Gestor**: loja
- **Vendedor**: apenas suas vendas
- **Financeiro**: visão completa read-only

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|---------------------|
| Tabela única sem abas | Quantidade de dados sobrecarrega |
| Sem funil | Conversão sem visualização = caixa-preta |
| Sem sazonalidade | Ignora padrões importantes |
| Apenas absolutos sem comparativos | Tendência é central |
| Treemap obrigatório (vs bar) | Treemap pode confundir; preferir bar simples |

---

## Escopo

### Incluído

- ✅ Página `/app/vendas` substituindo placeholder do PRD-003
- ✅ 4 abas (Visão Geral, Produtos, Clientes, Funil)
- ✅ Hook agregador `useSalesAnalytics(filters)` consumindo orders, customers, products, leads
- ✅ Filtros multidimensionais (período, loja, vendedor, categoria, marca, canal)
- ✅ KPIs com tendência
- ✅ 4 gráficos na Visão Geral
- ✅ Top 20 produtos com tendência
- ✅ Top 20 clientes
- ✅ Funil de conversão visual
- ✅ Detecção de sazonalidade (comparativo year-over-year)
- ✅ Alertas de produtos em queda
- ✅ Drill-downs para PRDs 030/012/045/043
- ✅ URL sync de filtros
- ✅ Permissões granulares
- ✅ Mobile responsivo

### Excluído

- ❌ Forecast com ML — Fase 2
- ❌ Cohort analysis avançada — Fase 2
- ❌ Análise de margem por produto (depende PRD-049 real) — placeholder
- ❌ Comparativo entre canais com atribuição (multi-touch) — Fase 2
- ❌ Export PDF/Excel — Fase 2
- ❌ A/B testing de campanhas — Fase 2
- ❌ Análise de cross-sell automática — Fase 2

---

## Requisitos Funcionais

### Página e abas

- **RF-001:** `SalesAnalyticsPage` em `src/features/sales-analytics/pages/`, rota `/app/vendas`.
- **RF-002:** Tabs do shadcn com 4 abas.
- **RF-003:** Filtros globais no header aplicam a todas as abas.
- **RF-004:** URL sync de aba ativa + filtros.

### Hook agregador

- **RF-005:** `useSalesAnalytics(filters)`:
  - Consome orders (filtrados por status='paid', período, dimensões)
  - Calcula totais, breakdown por dimensão, top N
- **RF-006:** `useFunnelMetrics(filters)`:
  - Calcula etapas: leads, qualificados (estágio "em qualificação"+), orçamentos enviados, aceitos, pedidos pagos
- **RF-007:** Memorização agressiva.

### Aba Visão Geral

- **RF-008:** 4 KPIs no topo com tendência.
- **RF-009:** 4 gráficos: linha temporal faturamento, bar categorias, bar marcas, pizza canais.
- **RF-010:** Card "Sazonalidade" comparando com mesmo mês ano anterior se variação > 25%.

### Aba Produtos

- **RF-011:** Tabela top 20 produtos com paginação (pode expandir para top 50).
- **RF-012:** Bar chart de performance por categoria.
- **RF-013:** Lista "Produtos em queda" (filtra > 30% queda vs período anterior).
- **RF-014:** Click em produto navega para ficha (PRD-030).

### Aba Clientes

- **RF-015:** Tabela top 20 clientes.
- **RF-016:** Indicador "Novos vs Recorrentes" (cliente novo = createdAt no período).
- **RF-017:** Click em cliente navega para ficha (PRD-012).

### Aba Funil

- **RF-018:** Visualização de funil com 5 etapas.
- **RF-019:** Cada etapa mostra absoluto + % da anterior.
- **RF-020:** Identificação automática de gargalo (etapa com maior queda relativa).
- **RF-021:** Sub-tabela: drill-down de cada etapa (lista de leads/quotes/orders).

### Permissões

- **RF-022:** Vendedor: vê apenas suas vendas (filtragem implícita).
- **RF-023:** Gestor: loja.
- **RF-024:** Owner: cross-store.

---

## Requisitos Não-Funcionais

- **RNF-001:** Página renderiza em < 800ms com 120 pedidos.
- **RNF-002:** Cálculos memoizados.
- **RNF-003:** Mobile com scroll horizontal em tabelas.
- **RNF-004:** WCAG 2.1 AA.

---

## Critérios de Aceitação

```gherkin
DADO Owner acessa /app/vendas
QUANDO observa Visão Geral
ENTÃO vê 4 KPIs, 4 gráficos
  E filtros aplicam em tempo real

DADO aplico filtro categoria=filtro + marca=Volvo
QUANDO filtros aplicam
ENTÃO Top Produtos mostra apenas filtros para Volvo
  E gráfico de categoria some/destaca apropriadamente
  E URL atualiza

DADO clico em produto na top 20
QUANDO ação processa
ENTÃO navego para /app/catalogo/:partId

DADO funil mostra Orçamentos enviados=90 e aceitos=50
QUANDO observo a etapa
ENTÃO vejo "56%" como taxa de conversão da etapa
  E se for etapa com maior queda, é destacada como gargalo

DADO faturamento maio/2026 = R$ 250k
  E maio/2025 = R$ 180k
QUANDO calcula sazonalidade
ENTÃO card "Sazonalidade: +39% vs ano anterior" aparece
```

---

## Fases de Implementação

| Fase | Objetivo |
|------|----------|
| 1 | Hook agregador + Aba Visão Geral |
| 2 | Aba Produtos |
| 3 | Aba Clientes |
| 4 | Aba Funil |
| 5 | Drill-downs + sazonalidade + mobile + polish |

---

## Dependências

| PRD | Status |
|-----|--------|
| PRD-017 (leads) | 📝 |
| PRD-030 (catálogo) | 📝 |
| PRD-031 (orçamentos) | 📝 |
| PRD-032 (pedidos) | 📝 |
| PRD-045 (classe ABC nos clientes) | 📝 |

---

## Cadeia

| Ordem | PRD |
|-------|-----|
| 1-25 | 010-040 |
| **26** | **PRD-041 ATUAL** |
| 27+ | 047-053 |

---

## Considerações de Segurança

- Dados estratégicos — permissões respeitadas (Vendedor não vê dados da loja)
- Top clientes contém PII; filtrado por carteira

---

## Convenções

| Elemento | Convenção |
|----------|-----------|
| Página | `SalesAnalyticsPage` |
| Hook | `useSalesAnalytics`, `useFunnelMetrics` |
| Pasta | `sales-analytics/` |

---

## Notas para o Agente Desenvolvedor

- 4 abas separam dimensões — não tentar caber tudo em uma tela
- Funil é destaque visual; usar componente custom se Recharts limitar
- Sazonalidade simples (year-over-year); ML é Fase 2
- Drill-downs são essenciais — cada elemento clicável deve levar a algum lugar útil

---

## Status

| Campo | Valor |
|-------|-------|
| Status | ⏳ PENDENTE |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 25/05/2026 | v1 | Criação inicial — análise multidimensional com 4 abas, funil, top rankings, sazonalidade |

---

**AILA - Sistemas Inteligentes**
