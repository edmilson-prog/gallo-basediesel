# PRD-050: Estoque (Análise)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _A definir após criação no Lovable_ |
| **Objetivo** | Construir análise de estoque baseada nos dados simples do PRD-030 — cobertura em dias, curva XYZ (giro), stockouts críticos, sugestões de reposição, identificação de excesso (capital parado) |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 4 |
| **Prioridade** | Alta |
| **Épico** | Bloco 4b — Gestão B (Onda 2) |
| **PRDs Relacionados** | PRD-030 (Catálogo), PRD-032 (Pedido — consumo histórico), PRD-040 (Cockpit), PRD-049 (Rentabilidade — produtos parados) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Feature-based; código em `src/features/inventory-analytics/` |

### Critérios de Complexidade

> **Justificativa de Alta:** análise multi-métrica do estoque (cobertura em dias, classificação XYZ via giro, identificação de stockouts e excesso, capital parado), cálculos derivados sobre consumo histórico (média móvel últimos 90 dias por produto), recomendações de reposição com sugestões de quantidade ideal, drill-down por produto, integração com PRD-030 (estoque básico) e PRD-032 (consumo histórico), preparação para integração DINTEC na Fase 2.

---

## Contexto do Problema

PRD-030 já tem `stockQuantity` e `stockMinThreshold` simples. Mas owner precisa **análise**:

**Quanto dura o estoque?** "Tenho 50 filtros, mas vendo 20 por mês — me dura 75 dias. Tenho 50 freios, mas vendo 200 por mês — dura 7 dias!" Sem análise de cobertura, decisões viram chute. **O que gira muito vs pouco?** Curva XYZ identifica giro — produtos X (alto giro) merecem mais estoque, Z (baixo) menos. **Quanto capital está parado?** Produto Z parado por meses é dinheiro morto. Owner precisa saber. **O que preciso comprar urgente?** Sem alertas proativos, stockouts acontecem.

Este PRD entrega: cobertura em dias por produto, classificação XYZ, lista de stockouts críticos, sugestões de reposição, identificação de excesso. Estrutura preparada para integração real com DINTEC na Fase 2.

---

## Conceito da Solução

### Cobertura em dias

```typescript
coverageInDays = stockQuantity / (consumoMedioDiario)
```

`consumoMedioDiario` = soma das quantidades vendidas (em pedidos pagos) nos últimos 90 dias / 90.

### Curva XYZ (giro)

Classifica produtos pelo giro:

| Classe | Critério |
|--------|----------|
| **X (alto giro)** | Vendas constantes, coverage < 30 dias |
| **Y (médio giro)** | Vendas irregulares, coverage 30-90 dias |
| **Z (baixo giro)** | Pouca venda, coverage > 90 dias OU sem vendas em 60 dias |

### Status do estoque por produto

| Status | Critério | Cor |
|--------|----------|-----|
| 🟢 OK | stockQuantity ≥ stockMinThreshold AND coverage ≥ 15 dias | Verde |
| 🟡 Baixo | stockQuantity < stockMinThreshold OR coverage < 15 dias | Amarelo |
| 🔴 Crítico | stockQuantity = 0 OR coverage < 5 dias | Vermelho |
| 🟣 Excesso | coverage > 180 dias E classe Z | Roxo |

### Modelo

```typescript
IInventoryAnalysis {
  partId: ID;
  partName: string;
  partOemCode: string;
  category: PartCategory;
  // Estoque atual
  stockQuantity: number;
  stockMinThreshold: number;
  // Consumo
  consumptionLast90Days: number;
  averageDailyConsumption: number;
  // Análise
  coverageInDays: number;
  curve: 'X' | 'Y' | 'Z';
  status: 'ok' | 'baixo' | 'critico' | 'excesso';
  // Sugestão
  recommendedReorder?: {
    suggestedQuantity: number;
    estimatedCostToReorder: number;
    rationale: string;
  };
  // Capital parado
  capitalTied: number;          // stockQuantity * unitCost
  storeId: ID;
}

IInventoryMetrics {
  totalProducts: number;
  byStatus: { ok: number; baixo: number; critico: number; excesso: number };
  byCurve: { X: number; Y: number; Z: number };
  totalCapitalTied: number;
  capitalInExcess: number;       // soma capitalTied dos produtos em excesso
  criticalProducts: IInventoryAnalysis[];
  reorderSuggestions: IInventoryAnalysis[];
  excessProducts: IInventoryAnalysis[];
}
```

### Sugestão de reposição

Para produtos críticos ou baixos:

```typescript
suggestedQuantity = max(
  stockMinThreshold,
  averageDailyConsumption * targetCoverageDays  // default 30 dias
)
```

Estimativa de custo = `suggestedQuantity * partUnitCost`.

Rationale exemplo: "Consumo médio: 5/dia. Estoque atual: 12 (cobertura 2.4 dias). Repor para cobertura de 30 dias."

### Página `/app/estoque`

Header: filtros (categoria, marca compatível, status estoque, classe XYZ, loja).

### 4 abas

1. **Visão Geral** — KPIs + distribuição
2. **Críticos & Reposição** — produtos em alerta + sugestões
3. **Análise XYZ** — produtos por classe
4. **Excesso & Capital Parado** — produtos com excesso

### Aba 1 — Visão Geral

KPIs:
- Total produtos
- Em estoque OK / Baixo / Crítico
- Capital total imobilizado
- Capital em produtos com excesso

Donut chart de status (OK/Baixo/Crítico/Excesso).

Tabela compacta com top 20 produtos por status crítico ordenados por urgência.

### Aba 2 — Críticos & Reposição

Lista priorizada por urgência:
- 🔴 Críticos primeiro
- 🟡 Baixos depois
- Ordenados por consumptionLast90Days (mais vendidos primeiro)

Cada item:
- Nome + OEM
- Estoque atual
- Cobertura em dias
- Consumo médio
- Sugestão de quantidade + estimativa de custo
- Rationale expandido (tooltip)

Botão "Gerar lista de compras" — exporta CSV simples (placeholder no MVP — toast informando).

### Aba 3 — Análise XYZ

Tabela com 3 colunas (X / Y / Z):
- Cada coluna lista produtos da classe
- Contagem total no header
- % do estoque por classe

Bar chart: faturamento vs estoque por classe (Pareto-style).

### Aba 4 — Excesso & Capital Parado

Lista de produtos com `status='excesso'`:
- Cobertura excessiva
- Capital amarrado (R$)
- Tempo sem venda (dias)
- Sugestão: "Considere promoção ou descontinuar"

Total de capital em excesso destacado no topo.

### Drill-downs

- Click em produto → ficha PRD-030
- Link da página → análise de margem do produto (PRD-049)

### Configuração `/app/configuracoes/estoque-analise`

Sub-rota PRD-019 (Owner):
- Janela de análise de consumo (padrão 90 dias)
- Cobertura alvo para sugestão de reposição (padrão 30 dias)
- Threshold de "excesso" em dias (padrão 180)
- Banner: "Integração com DINTEC disponível na Fase 2 — dados de estoque virão direto do ERP"

### Permissões

- **Owner**: tudo
- **Gestor**: loja, sem configuração
- **Financeiro**: read-only (capital amarrado)
- **Vendedor**: SEM ACESSO

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|---------------------|
| Análise sem cobertura em dias | Quantidade absoluta engana sem contexto de consumo |
| Sem curva XYZ | Decisões viram tudo igual; XYZ guia priorização |
| Sem sugestão de reposição | Owner faz cálculo manual |
| Sem excesso | Capital morto fica invisível |
| Análise em tempo real (cada venda) | Diário é suficiente; memoização funciona |

---

## Escopo

### Incluído

- ✅ Engine `calculateInventoryAnalysis(parts, orders, settings)`
- ✅ Página `/app/estoque` substituindo placeholder do PRD-003
- ✅ 4 abas (Visão Geral, Críticos, XYZ, Excesso)
- ✅ Filtros + URL sync
- ✅ Indicadores visuais semânticos (cores por status)
- ✅ Sugestão de reposição automática com rationale
- ✅ Cálculo de capital amarrado
- ✅ Sub-rota `/app/configuracoes/estoque-analise` (Owner)
- ✅ Hooks consumíveis pelo PRD-040 (cockpit)
- ✅ Permissões (Vendedor bloqueado)
- ✅ Botão "Gerar lista de compras" placeholder (Fase 2)
- ✅ Drill-downs para PRDs 030/049
- ✅ Mobile responsivo

### Excluído

- ❌ Integração real DINTEC — Fase 2
- ❌ Pedidos de compra automatizados — Fase 2
- ❌ Previsão de demanda com ML — Fase 2
- ❌ Multi-depósito (estoque em N locais) — Fase 2
- ❌ Reserva de estoque (cliente reserva por X dias) — Fase 2
- ❌ Inventário cíclico — Fase 2
- ❌ Notificações automáticas de stockout — Fase 2
- ❌ Movimentações detalhadas (entrada/saída registradas) — Fase 2

---

## Requisitos Funcionais

### Engine

- **RF-001:** `calculateInventoryAnalysis(parts, orders, settings)` função pura:
  - Para cada part: calcular consumptionLast90Days via orderItems agregados
  - averageDailyConsumption = consumptionLast90Days / 90
  - coverageInDays = stockQuantity / averageDailyConsumption (se 0, infinito)
  - Classifica curva XYZ baseada em coverage e regularidade
  - Determina status (ok/baixo/critico/excesso)
  - Calcula recommendedReorder se status crítico/baixo
  - Calcula capitalTied = stockQuantity * (partUnitCost || 0)
- **RF-002:** `calculateInventoryMetrics(analyses)` agrega para KPIs.
- **RF-003:** Hooks `useInventoryAnalysis(filters)`, `useInventoryMetrics(filters)`.

### Página

- **RF-004:** `InventoryAnalyticsPage` em `src/features/inventory-analytics/pages/`, rota `/app/estoque`.
- **RF-005:** Header: filtros (categoria, marca, status, curva, loja Owner).
- **RF-006:** Tabs com 4 abas.

### Aba Visão Geral

- **RF-007:** 5 KPIs: total produtos, OK, Baixo, Crítico, Capital amarrado.
- **RF-008:** Donut chart de status.
- **RF-009:** Tabela compacta top 20 ordenada por urgência.

### Aba Críticos & Reposição

- **RF-010:** Lista priorizada por urgência (criticos > baixos, dentro de cada por consumo).
- **RF-011:** Cada item com sugestão de quantidade + custo estimado + rationale tooltip.
- **RF-012:** Botão "Gerar lista de compras" → toast placeholder ou CSV simples (decisão do agente).

### Aba Análise XYZ

- **RF-013:** Layout 3 colunas (X/Y/Z) com contagem.
- **RF-014:** Bar chart faturamento vs estoque por classe.

### Aba Excesso

- **RF-015:** Lista de excessos com capital amarrado.
- **RF-016:** Total em destaque.
- **RF-017:** Sugestão textual: "Considere promoção ou descontinuar".

### Configuração

- **RF-018:** `InventoryAnalysisConfigPage` em `/app/configuracoes/estoque-analise`.
- **RF-019:** 3 sliders configuráveis + banner Fase 2.
- **RF-020:** Salvar com audit log.

### Permissões

- **RF-021:** Vendedor BLOQUEADO via GuardedRoute.
- **RF-022:** Gestor: loja read-only.
- **RF-023:** Owner/Financeiro: tudo.

---

## Requisitos Não-Funcionais

- **RNF-001:** Análise de 200 peças < 500ms.
- **RNF-002:** Memorização agressiva.
- **RNF-003:** Mobile responsivo.
- **RNF-004:** WCAG 2.1 AA.

---

## Critérios de Aceitação

```gherkin
DADO produto com stockQuantity=10 e consumo médio 0.5/dia
QUANDO calculateInventoryAnalysis executa
ENTÃO coverageInDays = 20
  E classe = X (alto giro: vendas constantes)
  E status = 'baixo' (cobertura < 30)

DADO produto sem vendas em 60 dias com stockQuantity=15
QUANDO calcula
ENTÃO classe = Z (baixo giro)
  E coverage = infinito → status = 'excesso'
  E capitalTied calculado

DADO Owner acessa /app/estoque aba Críticos
QUANDO observa
ENTÃO lista ordenada por urgência (críticos primeiro)
  E cada item com sugestão de reposição e rationale

DADO Vendedor tenta acessar /app/estoque
QUANDO valida
ENTÃO bloqueado

DADO clico "Gerar lista de compras"
QUANDO ação processa
ENTÃO toast: "Funcionalidade completa disponível na Fase 2"
  E opcionalmente download de CSV básico
```

---

## Fases de Implementação

| Fase | Objetivo |
|------|----------|
| 1 | Engine + hooks |
| 2 | Aba Visão Geral + Aba Críticos |
| 3 | Aba XYZ + Aba Excesso |
| 4 | Configuração + drill-downs + polish |

---

## Dependências

| PRD | Status |
|-----|--------|
| PRD-030 (stockQuantity, unitCost) | 📝 |
| PRD-032 (consumo) | 📝 |
| PRD-040 (consome hook) | 📝 |

---

## Cadeia

| Ordem | PRD |
|-------|-----|
| 1-29 | 010-049 |
| **30** | **PRD-050 ATUAL** |
| 31+ | 051-053 |

---

## Considerações de Segurança

- Capital amarrado é informação estratégica — restrito a Owner/Gestor/Financeiro
- Custos vinculados ao produto (não expor ao Vendedor)

---

## Convenções

| Elemento | Convenção |
|----------|-----------|
| Página | `InventoryAnalyticsPage` |
| Engine | `calculateInventoryAnalysis` |
| Pasta | `inventory-analytics/` |

---

## Notas para o Agente Desenvolvedor

- Análise sobre dados existentes (stockQuantity do PRD-030); sem mutar
- Cálculos pesados — memoizar agressivamente
- Vendedor BLOQUEADO (capital amarrado, custos)
- Sugestões de reposição com rationale claro
- Drill-down para produto leva à ficha PRD-030
- Banner Fase 2 sobre integração DINTEC

---

## Status

| Campo | Valor |
|-------|-------|
| Status | ⏳ PENDENTE |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 25/05/2026 | v1 | Criação inicial — análise de estoque com cobertura, XYZ, sugestões de reposição, excesso |

---

**AILA - Sistemas Inteligentes**
