# PRD-045: Curva ABC

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                              |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                   |
| **Objetivo**          | Classificar clientes automaticamente em A/B/C baseado em receita acumulada, detectar migrações entre classes, fornecer drill-down para ação comercial, e integrar com ficha, lista, painel e métricas |
| **Tipo**              | Feature                                                                                                                                                                                               |
| **Complexidade**      | Média                                                                                                                                                                                                 |
| **Total de Fases**    | 4                                                                                                                                                                                                     |
| **Prioridade**        | Alta                                                                                                                                                                                                  |
| **Épico**             | Bloco 4a — Gestão A (Onda 2)                                                                                                                                                                          |
| **PRDs Relacionados** | PRD-012 (Ficha), PRD-014 (Painel), PRD-015 (Lista Clientes), PRD-032 (Pedido), PRD-044 (Positivação), PRD-046 (Carteira)                                                                              |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                    |
| **Padrão de código**  | Feature-based; código em `src/features/abc-curve/`                                                                                                                                                    |

### Critérios de Complexidade

> **Justificativa de Média:** classificação ABC é cálculo derivado conhecido (cumulativo até X% da receita), parametrização simples (limiares default 80/95), página dedicada com gráfico de Pareto + tabela por classe, indicador na ficha, detecção de migrações via comparativo de períodos. Sem mutations próprias além de configurações; complexidade está na visualização e integrações múltiplas.

---

## Contexto do Problema

Curva ABC é fundamento de gestão comercial: 20% dos clientes geram 80% da receita. Hoje sem classificação automatizada:

**Vendedor trata todos iguais.** Cliente A merece mais atenção que C — mas sem marcador, esforço é distribuído desigualmente sem critério. **Migrações invisíveis.** Cliente que era A virou B (queda) deveria gerar alerta. Sem detecção, perda silenciosa. **Estratégia comercial sem base.** Owner não sabe "estamos perdendo Cs ou ganhando As?".

Este PRD entrega: classificação automática, indicador visual na ficha (PRD-012 já reservou espaço), drill-down por classe, detecção de migrações, gráfico de Pareto.

---

## Conceito da Solução

### Algoritmo

1. Ordenar clientes por receita total no período (default últimos 12 meses) descendente
2. Calcular receita acumulada por cliente
3. Classificar:
   - **A**: clientes que somam até X% da receita total (default 80%)
   - **B**: próximos clientes que somam até Y% (default 95%)
   - **C**: restante

Parametrizável em `IPlatformSettings.abcCurveSettings`.

### Modelo

```typescript
ICustomerABC {
  customerId: ID;
  class: 'A' | 'B' | 'C';
  revenue: number;                  // receita no período
  cumulativeRevenuePct: number;     // % acumulado
  rank: number;
  previousClass?: 'A' | 'B' | 'C';  // classe no período anterior
  migration: 'subiu' | 'caiu' | 'manteve' | 'novo';
  calculatedAt: ISO8601;
}

IABCMetrics {
  period: { start: ISO8601; end: ISO8601 };
  totalRevenue: number;
  classDistribution: {
    A: { count: number; revenue: number; pct: number };
    B: { count: number; revenue: number; pct: number };
    C: { count: number; revenue: number; pct: number };
  };
  migrations: {
    upgradedToA: ICustomerABC[];    // subiu para A
    downgradedFromA: ICustomerABC[]; // caiu de A
    newCustomersInA: ICustomerABC[]; // novos clientes que entraram direto em A
  };
}
```

### Página `/app/curva-abc`

**Header**: filtros (período, loja Owner, vendedor)

**KPIs no topo:**

- Total clientes classificados
- Distribuição A/B/C (contagem + % da receita por classe)
- Migrações relevantes (X subiram, Y caíram)

**Gráfico de Pareto** (combo: barras de receita por cliente + linha cumulativa):

- Recharts ComposedChart
- Eixo X: clientes ordenados por receita
- Barras: receita individual
- Linha: % acumulado
- Linhas verticais marcando corte A/B e B/C

**Tabela por classe** (3 cards A/B/C lado a lado):

- Cada card: contagem, receita total, % do total
- Click expande lista de clientes da classe

**Alertas de migração:**

- Banner amarelo: "X clientes caíram de A para B/C" (link)
- Banner verde: "Y clientes subiram para A" (link)

### Indicador na ficha do cliente (PRD-012)

Adicionar badge na ficha:

- 🟢 Classe A (verde)
- 🟡 Classe B (amarelo)
- 🟠 Classe C (laranja)

Tooltip ao hover: "Receita 12 meses: R$ X (top Y% — classe A)".

Em migrações: indicador adicional "↑ subiu de B" ou "↓ caiu de A".

### Filtro em `/app/clientes` (PRD-015)

Adicionar filtro "Classe ABC" (multi-select). Sincronizar URL.

### Página por classe `/app/curva-abc/:class`

Drill-down para uma classe específica:

- Header: "Clientes Classe A — N clientes, R$ X em receita"
- Tabela paginada com colunas: cliente, vendedor, receita, posição no ranking, migração

### Configuração `/app/configuracoes/curva-abc`

Sub-rota de PRD-019 (substitui placeholder). Owner only:

- Período de análise (slider 3-24 meses, default 12)
- Limiar Classe A (slider 70-90%, default 80%)
- Limiar Classe B (slider 90-99%, default 95%)
- Botão "Recalcular agora"

### Detecção de migrações

Algoritmo:

1. Calcular classificação no período atual
2. Calcular classificação no período anterior (mesmo span)
3. Comparar `previousClass` vs `class` por customerId
4. Marcar `migration`

Migrações executadas no recálculo (manual ou agendado diariamente).

### Permissões

- **Owner**: configura limiares, vê cross-store
- **Gestor**: vê loja
- **Vendedor**: vê dados de seus clientes (filtragem por carteira)

### Alternativas Consideradas

| Alternativa                         | Por que descartada                                   |
| ----------------------------------- | ---------------------------------------------------- |
| Curva ABC manual (Owner classifica) | Defeat the purpose — automação é o valor             |
| Sem detecção de migração            | Perde alerta crucial                                 |
| Limiares fixos 80/15/5              | Cada empresa tem realidade — parametrizável é melhor |
| Período fixo 12 meses               | Algumas empresas querem 6 ou 24                      |
| Sem gráfico de Pareto               | Visual icônico do conceito ABC                       |

---

## Escopo

### Incluído

- ✅ Modelo `ICustomerABC`, `IABCMetrics`, settings em `IPlatformSettings.abcCurveSettings`
- ✅ Engine `classifyABC(customers, orders, settings)` em `src/features/abc-curve/engine/`
- ✅ Engine `detectMigrations(currentClassification, previousClassification)`
- ✅ Hook `useABCClassification(filters)` e `useCustomerABC(customerId)` exportados
- ✅ Página `/app/curva-abc` com KPIs, gráfico de Pareto, tabela por classe, alertas de migração
- ✅ Drill-down `/app/curva-abc/:class`
- ✅ Sub-rota `/app/configuracoes/curva-abc` para parametrização (Owner)
- ✅ Badge na ficha do cliente (PRD-012)
- ✅ Filtro "Classe ABC" em `/app/clientes` (PRD-015)
- ✅ Recálculo agendado (diário no MVP — placeholder; Edge Function na Fase 2)
- ✅ Botão "Recalcular agora" no painel admin
- ✅ Audit log em mudanças de configuração
- ✅ Permissões granulares

### Excluído

- ❌ Curva ABC por categoria de produto — Fase 2
- ❌ Curva ABC por vendedor (top vendedores) — Fase 2
- ❌ Projeção futura de migração — Fase 2
- ❌ Estratégias automatizadas por classe — Fase 2
- ❌ Export PDF — Fase 2
- ❌ Recálculo em tempo real a cada pedido — Fase 2 (diário no MVP)

---

## Requisitos Funcionais

### Engine

- **RF-001:** Tipos `ICustomerABC`, `IABCMetrics`, `ABCClass`.
- **RF-002:** Settings: `IPlatformSettings.abcCurveSettings = { periodMonths: 12, classAThreshold: 0.80, classBThreshold: 0.95 }`.
- **RF-003:** `classifyABC(customers, orders, settings)` função pura:
  - Filtra orders no período
  - Agrega receita por customerId
  - Ordena desc, calcula cumulativa, classifica
  - Retorna `ICustomerABC[]`
- **RF-004:** `detectMigrations(current, previous)` retorna `{ upgradedToA, downgradedFromA, newCustomersInA }`.
- **RF-005:** Hooks `useABCClassification(filters)`, `useCustomerABC(customerId)`, `useABCMetrics(filters)`.

### Página `/app/curva-abc`

- **RF-006:** `ABCCurvePage` em `src/features/abc-curve/pages/`.
- **RF-007:** Filtros: período (3m/6m/12m/24m/personalizado), loja (Owner), vendedor (Gestor/Owner).
- **RF-008:** KPIs: total clientes, distribuição (3 cards A/B/C com count + receita + %).
- **RF-009:** Gráfico Pareto via Recharts ComposedChart (barras + linha).
- **RF-010:** Alertas de migração: banners coloridos com contadores; click leva à lista filtrada.
- **RF-011:** Tabela com 3 colunas (uma por classe) ou tabs com lista — decisão do agente desenvolvedor.

### Drill-down

- **RF-012:** `ABCClassPage` em `/app/curva-abc/:class` (A, B ou C).
- **RF-013:** Tabela paginada de clientes da classe com colunas: nome, vendedor, receita período, % cumulativa, migração, ações.

### Configuração

- **RF-014:** `ABCConfigPage` em `/app/configuracoes/curva-abc` (substitui placeholder PRD-019).
- **RF-015:** Sliders para periodMonths, classAThreshold, classBThreshold.
- **RF-016:** Botão "Recalcular agora" dispara `recalculateABC()` imediato.
- **RF-017:** Salvar com audit log.

### Recálculo

- **RF-018:** Hook `useABCRecalculationTimer()` roda diariamente (no MVP, timer no front; Fase 2 Edge Function).
- **RF-019:** Resultado armazenado em estado/mock; consultas usam cache.

### Integrações

- **RF-020:** PRD-012 (Ficha): badge da classe no header. Componente `<ABCBadge customerId>`.
- **RF-021:** PRD-015 (Lista Clientes): filtro multi-select "Classe ABC".
- **RF-022:** PRD-014 (Painel Gestor): widget opcional "Distribuição ABC da carteira".
- **RF-023:** PRD-044 (Positivação): filtro adicional "Classe ABC" na lista de não-positivados.

### Permissões

- **RF-024:** Vendedor vê classificação só de clientes da sua carteira.
- **RF-025:** Configuração: Owner only.

### Audit

- **RF-026:** Audit em mudanças de configuração (`action='abc_config_update'`).
- **RF-027:** Audit em recálculo manual (`action='abc_recalculate_manual'`).

---

## Requisitos Não-Funcionais

- **RNF-001:** Cálculo para 70 clientes < 200ms.
- **RNF-002:** Memorização agressiva.
- **RNF-003:** WCAG 2.1 AA.

---

## Critérios de Aceitação

```gherkin
DADO 70 clientes com receita variada nos últimos 12 meses
QUANDO classifyABC executa com defaults (80/95)
ENTÃO clientes ordenados por receita
  E os primeiros que somam 80% = classe A
  E próximos até 95% = classe B
  E restante = classe C

DADO cliente Aurora era classe B no período anterior
  E agora subiu para A
QUANDO detectMigrations executa
ENTÃO Aurora aparece em upgradedToA com migration='subiu'

DADO acesso /app/curva-abc
QUANDO página carrega
ENTÃO vejo KPIs com distribuição
  E gráfico de Pareto com linhas verticais nos cortes
  E banners de migração se houver

DADO acesso ficha de cliente Classe A
QUANDO observo header
ENTÃO vejo badge verde "Classe A"
  E tooltip com receita 12m e ranking

DADO Owner muda classAThreshold de 80% para 70%
QUANDO save processa
ENTÃO próxima execução de classifyABC usa 70%
  E botão "Recalcular agora" dispara reclassificação imediata
```

---

## Fases de Implementação

| Fase | Objetivo                                         |
| ---- | ------------------------------------------------ |
| 1    | Engine + hooks + settings                        |
| 2    | Página principal com gráfico Pareto + drill-down |
| 3    | Badge na ficha + filtro em lista + widget painel |
| 4    | Configuração + detecção de migrações + polish    |

---

## Dependências

| PRD                             | Status |
| ------------------------------- | ------ |
| PRD-012 (badge)                 | 📝     |
| PRD-014 (widget opcional)       | 📝     |
| PRD-015 (filtro)                | 📝     |
| PRD-019 (sub-rota configuração) | 📝     |
| PRD-032 (receita)               | 📝     |

---

## Cadeia

| Ordem  | PRD               |
| ------ | ----------------- |
| 1-22   | 010-044           |
| **23** | **PRD-045 ATUAL** |
| 24+    | 046, demais       |

---

## Considerações de Segurança

- Classificação é estratégia comercial sensível — permissões por carteira no Vendedor
- Mudanças em limiares re-classificam toda a base — audit log obrigatório

---

## Convenções

| Elemento | Convenção                                       |
| -------- | ----------------------------------------------- |
| Página   | `ABCCurvePage`, `ABCClassPage`, `ABCConfigPage` |
| Engine   | `classifyABC`, `detectMigrations`               |
| Pasta    | `abc-curve/`                                    |

---

## Notas para o Agente Desenvolvedor

- Algoritmo conhecido — siga o padrão de Pareto exatamente
- Parametrização total via settings (Owner controla)
- Recálculo diário é suficiente; tempo real fica para Fase 2
- Badge na ficha respeita carteira (Vendedor não vê classe de cliente alheio)
- Gráfico Pareto é icônico — caprichar visualmente

---

## Status

| Campo  | Valor                                |
| ------ | ------------------------------------ |
| Status | ✅ IMPLEMENTADO (v0.29.0 — `Pareto`) |

---

## Histórico

| Data       | Versão | Alteração                                                                                                                                       |
| ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — classificação ABC com gráfico Pareto, drill-down, migrações, integração com ficha/lista/painel                                |
| 26/05/2026 | v1.1   | Implementação Fase 1 — `abc-curve/` em v0.29.0 (`Pareto`); inclui fix de runtime `.items`→`.data` em hooks de Cockpit/Positivação shippados |

---

**AILA - Sistemas Inteligentes**
