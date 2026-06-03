# Indicadores por Produto — Design

> **Data:** 2026-06-02
> **Status:** Aprovado para planejamento
> **Projeto:** GALLO BASE DIESEL
> **Issue relacionada:** [#23 — Formalizar taxonomia de subcategorias](https://github.com/edmilson-prog/gallo-basediesel/issues/23)

---

## 1. Problema e conceito

Hoje a plataforma tem **Metas** (`IGoal`), que medem métricas comerciais (`revenue`, `margin`, `tickets`, etc.) por escopo (loja/individual) e período. As metas **não têm dimensão de produto** — não dá pra acompanhar, por exemplo, "a equipe deve vender R$ 400k em **filtros** este mês".

Esse acompanhamento por recorte de produto é, conceitualmente, um **Indicador** — um número coletivo de categoria, distinto de uma meta pessoal. Esta feature entrega o conceito de **Indicador por produto** como entidade própria, reaproveitando a maquinaria visual e de cálculo das metas.

**Indicador ≠ Meta.** Indicador é um conceito separado, com rotas, telas e provider próprios. Mas reusa os helpers de progresso (semáforo, projeção) e os componentes visuais das metas para não duplicar código.

---

## 2. Decisões do brainstorming

| Decisão                 | Resultado                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| Relação com Metas       | Conceito **separado** (entidade própria, reuso máximo da maquinaria)                                     |
| Recorte de produto      | `category`, `sku`, `group` (**subcategoria fora do MVP** → issue #23)                                    |
| Métricas                | `faturamento`, `quantidade`, `margem`, `pedidos`                                                         |
| Escopo                  | `store` (coletivo), `individual`, `global` (cross-store)                                                 |
| Ranking de contribuição | **Sim** — abre o número por vendedor                                                                     |
| Períodos                | `diario`, `semanal`, `mensal`, `trimestral`, `anual`                                                     |
| Riqueza visual          | **Igual às metas** — barra, semáforo, projeção, dias restantes, gráfico evolutivo, notificações de marco |
| Localização             | **Área própria** (`/app/gestao/indicadores`) **+ widget** no painel                                      |
| Nome do conceito        | **Indicador**                                                                                            |

---

## 3. Abordagem arquitetural

**Entidade própria que reusa a maquinaria** (escolhida sobre "estender IGoal" e "entidade 100% paralela"):

- Tipo, provider, rotas e telas **próprios** → separação conceitual que o usuário pediu.
- Engine de progresso **reaproveita** `computeProjection` e `describePeriodWindow` (já em `src/features/goals/engine/projection.ts`).
- `statusFromRatio` (semáforo) e `computeTrend` serão **extraídos** da engine de metas para um módulo compartilhado, sem mudar o comportamento das metas.
- Componentes visuais (barra de progresso, badge de semáforo, gráfico evolutivo) viram compartilhados.

---

## 4. Modelo de dados

Arquivo novo: `src/shared/types/indicators.ts`.

```typescript
import type { Division, ID, ISO8601 } from "./common";
import type { PartCategory } from "./part-identification";
import type { GoalProgressStatus, GoalProgressTrend } from "./goals";

type IndicatorMetric = "faturamento" | "quantidade" | "margem" | "pedidos";
type IndicatorScopeLevel = "store" | "individual" | "global";
type IndicatorPeriodType = "diario" | "semanal" | "mensal" | "trimestral" | "anual";
type IndicatorStatus = "ativo" | "concluido" | "arquivado" | "cancelado";

/** Recorte de produto — união discriminada por `kind`. Subcategoria fora do MVP (issue #23). */
type ProductSelector =
  | { kind: "category"; categories: PartCategory[] }
  | { kind: "sku"; partIds: ID[] }
  | { kind: "group"; label: string; categories?: PartCategory[]; partIds?: ID[] };

interface IProductIndicator {
  id: ID;
  storeId: ID;
  name: string; // "Filtros — Maio 2026" (autogerado/editável)
  selector: ProductSelector;
  metric: IndicatorMetric;
  scopeLevel: IndicatorScopeLevel;
  sellerId?: ID; // quando scopeLevel === "individual"
  period: { type: IndicatorPeriodType; start: ISO8601; end: ISO8601 };
  targetValue: number;
  status: IndicatorStatus;
  division?: Division;
  rewardDescription?: string;
  createdBy: ID;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

/** Derivado em runtime — espelha IGoalProgress + ranking de contribuição. */
interface IIndicatorProgress {
  indicatorId: ID;
  currentValue: number;
  percentage: number;
  projection: number;
  daysRemaining: number;
  totalDays: number;
  status: GoalProgressStatus;
  trend: GoalProgressTrend;
  paceRatio: number;
  contributors: { sellerId: ID; value: number; share: number }[];
}
```

### 4.1. Denormalização de categoria no item (decisão C1 + fallback C2)

`IOrderItem` hoje guarda `partId`/`partName` mas **não** a categoria. Pra somar "filtros" é preciso saber a categoria de cada item.

- **C1 (escolhida):** adicionar campos **opcionais aditivos** ao `IOrderItem`:
  ```typescript
  partCategory?: PartCategory;
  partSubcategory?: string; // capturado já visando issue #23, não usado no MVP
  ```
  Coerente com o item já congelar `unitPrice`/`unitCost`/`marginValue` no momento da venda. Engine rápida; Supabase agrega direto.
- **C2 (fallback):** quando o item não tem `partCategory` (mocks antigos), a engine resolve via mapa `partId → IPart`.

A engine implementa C1 com fallback automático para C2.

---

## 5. Engine de cálculo

Arquivo novo: `src/features/indicators/engine/calculate.ts`.

```typescript
export interface IIndicatorContext {
  orders: IOrder[];
  parts?: IPart[]; // fallback C2
  now?: Date;
}

function buildItemMatcher(sel: ProductSelector, partsMap: Map<ID, IPart>) {
  return (item: IOrderItem): boolean => {
    const cat = item.partCategory ?? partsMap.get(item.partId)?.category;
    switch (sel.kind) {
      case "category":
        return !!cat && sel.categories.includes(cat);
      case "sku":
        return sel.partIds.includes(item.partId);
      case "group":
        return (
          (!!cat && (sel.categories?.includes(cat) ?? false)) ||
          (sel.partIds?.includes(item.partId) ?? false)
        );
    }
  };
}
```

Fluxo de `calculateIndicatorProgress(indicator, context)`:

1. Recorte de escopo no **pedido**: `storeId`, `sellerId` (se `individual`), `division`, período, `paymentStatus === "pago"`.
2. Em cada pedido elegível, filtra os **itens que casam** com o `selector`.
3. Agrega por métrica:

   | Métrica       | Agregação sobre itens que casam                  |
   | ------------- | ------------------------------------------------ |
   | `faturamento` | `Σ item.total`                                   |
   | `quantidade`  | `Σ item.quantity`                                |
   | `margem`      | `Σ item.marginValue`                             |
   | `pedidos`     | nº de **pedidos distintos** com ≥1 item que casa |

4. **Ranking de contribuição:** acumula o valor casado por `order.sellerId`; ao final ordena desc e calcula `share = value / currentValue`.
5. `percentage`, `projection`, `paceRatio`, `status`, `trend` via helpers compartilhados (`computeProjection`, `describePeriodWindow`, `statusFromRatio`, `computeTrend` genérico que soma "valor casado" em vez de `order.total`).

**Refator compartilhado:** extrair `statusFromRatio` e `computeTrend` de `goals/engine/calculate.ts` para `src/shared/progress/` (alinhado a `src/shared/detail-views` e `src/shared/list-views` já existentes), importado pelas duas engines. Comportamento das metas inalterado.

**Performance (RNF):** passada linear pedidos × itens; com C1 sem lookup. Bate < 50ms.

---

## 6. Providers, mocks e hooks

- **Provider** `IIndicatorsProvider` no padrão de `goalsProvider`: contrato + impl mock no `factory.ts`; drop-in Supabase na Fase 2.
- **Mocks** `src/mocks/generators/indicator.ts`: ~12 indicadores variados (mix de `selector.kind`, métricas, escopos, períodos; alguns concluídos históricos, 1 cancelado). Targets calibrados pela soma real dos itens nos mocks de pedido.
- **C1 nos mocks:** atualizar o gerador de pedidos pra carimbar `partCategory` (e `partSubcategory`) no item a partir da peça sorteada.
- **Hooks** (espelham os de metas):
  - `useIndicatorProgress(id)` — carrega indicador + pedidos do escopo + (fallback) peças; memoiza o cálculo.
  - `useIndicators(filters)` / `useStoreIndicators(storeId)` — listas.
  - `useIndicatorAutoStatusUpdate()` — transição automática `concluido`/`arquivado` no fim do período.

---

## 7. UI — rotas e telas

### `/app/gestao/indicadores` — Dashboard

- KPIs no topo: indicadores ativos, % média de atingimento, nº ≥ 100%, nº atrasados.
- Tabela filtrável (recorte, métrica, escopo, status, período) + URL sync.
- Bar chart de % atingido por indicador.
- Vendedor vê em **modo leitura** os indicadores que o incluem.

### `/app/gestao/indicadores/novo` — Criação (Owner/Gestor)

1. **Recorte de produto** — seletor que troca de UI conforme `kind`:
   - `category`: chips das 10 categorias.
   - `sku`: autocomplete de SKU (1+ produtos).
   - `group`: montador de grupo nomeado (mistura categorias + SKUs).
2. **Métrica** (4 opções com explicação inline).
3. **Escopo + período** (datas auto-preenchidas, editáveis).
4. **Valor-alvo** com sugestão baseada no período anterior.
5. **Recompensa** (textarea opcional).

### `/app/gestao/indicadores/:id` — Detalhe (`DetailLayout`)

- Header: nome, recorte (badge), métrica, escopo, datas, status, ações.
- Resumo de progresso: barra, valor atual/alvo, %, semáforo, projeção, dias restantes.
- **Gráfico evolutivo** (Recharts): realizado vs esperado proporcional.
- **Ranking de contribuição por vendedor** (barra horizontal: quanto cada um somou).
- Composição clicável: pedidos/itens que somaram (link p/ PRD-032).

### Widget "Indicadores do mês"

- No Painel do Gestor / cockpit: lista compacta com mini-barra; click → detalhe.

---

## 8. Notificações, permissões e status automático

- **Notificações de marco:** reusa o mecanismo das metas (toast em 50/80/100%), threshold em `IPlatformSettings`.
- **Permissões** (espelham metas):
  - **Owner:** tudo cross-store.
  - **Gestor:** sua loja — cria/edita/arquiva/cancela.
  - **Vendedor:** leitura dos indicadores que o incluem.
- **Status automático:** `useIndicatorAutoStatusUpdate` vira `concluido` (≥100% no fim do período) ou `arquivado` (senão).
- **Audit log:** criação, edição, mudança de alvo, arquivamento, cancelamento (com motivo), transições automáticas.

---

## 9. Fases de implementação

| Fase | Entrega                                                                                                                     | Arquivos (est.) |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1    | Tipos `indicators.ts`, denormalização C1 no `IOrderItem` + mocks, engine + matcher, helpers compartilhados extraídos, hooks | ~7              |
| 2    | Provider + dashboard (`/indicadores`): KPIs, tabela, filtros, bar chart                                                     | ~5              |
| 3    | Criação `/novo`: seletor de recorte multimodal + sugestões + audit                                                          | ~5              |
| 4    | Detalhe `/:id`: progresso, gráfico evolutivo, ranking de contribuição, composição                                           | ~5              |
| 5    | Status automático, notificações de marco, widget no painel, responsivo, doc                                                 | ~3              |

---

## 10. Fora do MVP

- ❌ Recorte por **subcategoria** — depende de formalizar a taxonomia → **issue #23**.
- ❌ Cascata indicador-de-loja → indicador-individual.
- ❌ Indicadores por equipe (`ITeam` dormente).
- ❌ Forecasting com ML.
- ❌ Export PDF/Excel.

---

## 11. Requisitos não-funcionais

- **Performance:** `calculateIndicatorProgress` < 50ms com 100 pedidos no período.
- **Reatividade:** mudanças em pedidos refletem em < 200ms (memoização por dependências).
- **Tipagem:** zero `any`; uniões literais para os types.
- **Acessibilidade:** WCAG 2.1 AA; gráficos com tabela alternativa.
- **Responsividade:** mobile usável; cards stack; tabela com scroll horizontal.
- **Tokens:** apenas tokens semânticos (`bg-background`, `text-foreground`…), nunca `--gallo-*` ou hex direto.
