# Design — Gráfico "Evolução de Venda" (mês atual, diário)

**Data:** 2026-05-28
**Feature:** `sales-analytics`
**Rota alvo:** `/app/gestao/vendas` (aba Visão Geral)
**Status:** Aprovado (brainstorming) — pronto para plano de implementação

---

## 1. Objetivo

Adicionar um card hero no topo da página de Vendas mostrando a **evolução do
faturamento acumulado diário do mês corrente** (dia 1 até o último dia), comparado
à meta, com previsão de fechamento e comparativos históricos. Referência visual: o
print fornecido pelo usuário; com melhorias acordadas (strip de KPIs, toggles de
série, modo "por vendedor").

## 2. Posicionamento e layout

- Card **full-width**, **primeiro elemento da aba Visão Geral** (`SalesOverviewTab`),
  acima da `SalesKpiRow`.
- O `DashboardLayout` já limita o conteúdo a `max-w-[1600px]` — o card ocupa
  exatamente essa largura, sem nenhum override de largura.
- Altura do gráfico ~380px. Estilo de card idêntico aos demais (`Card`, `p-5`,
  header com título + subtítulo + ação à direita), estados de loading (`Skeleton`)
  e vazio iguais aos charts existentes.
- `RevenueOverTimeChart` (12 meses) **permanece** na grade abaixo — é complementar
  (tendência longa vs. ritmo do mês corrente).

## 3. Séries

Eixo X = dias do mês (1…último dia). Cada tick mostra **número do dia + letra do dia
da semana** (D S T Q Q S S); **fins de semana esmaecidos** e com leve sombreamento
de coluna (markArea). **Linha vertical de referência "Hoje"**.

| Série                  | Cor / estilo                  | Default | Cálculo                                                                                                                    |
| ---------------------- | ----------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Vendas no mês**      | vermelho, linha + área + dots | visível | Faturamento acumulado (pedidos `pago`) do dia 1 até **hoje**; `null` após hoje                                             |
| **Objetivo**           | roxo, sólido                  | visível | Meta acumulada linear: `targetValue × dia / diasDoMês` (mês inteiro)                                                       |
| **Previsão de vendas** | amarelo, tracejado            | visível | Run-rate: `(realizadoHoje / diaHoje) × dia`, para `dia ≥ hoje`; conecta na ponta da linha de Vendas (`null` antes de hoje) |
| **Mês passado**        | cinza, tracejado              | oculto  | Faturamento acumulado do mês anterior, por dia-do-mês (mês inteiro)                                                        |
| **Ano passado**        | cinza, pontilhado             | oculto  | Faturamento acumulado do mesmo mês no ano anterior, por dia-do-mês                                                         |

- **Toggle por série** via **legenda de chips clicáveis** no rodapé do card. Estado
  local (`useState`); padrão = Vendas + Objetivo + Previsão ligadas; comparativos
  desligados. Sem persistência em localStorage (YAGNI).
- **Cores:** mantidas categóricas (vermelho/roxo/amarelo/cinza), independentes do
  `data-theme`. Consumir via tokens (`--gallo-*` / vars semânticas) seguindo o padrão
  dos charts do cockpit; nunca hex hardcoded em componente.

## 4. Strip de KPIs (melhoria sobre o print)

Linha de 4 mini-cards entre o header e o gráfico:

1. **Realizado (até hoje)** + % da meta proporcional do dia.
2. **Meta do mês** + valor esperado hoje.
3. **Projeção fim do mês** (= previsão no último dia) + % da meta.
4. **Gap projetado** (meta − projeção), com cor (abaixo/acima).

Reutiliza utilitários de formatação existentes (`formatBRL`, `formatBRLCompact`).

## 5. "Detalhar por vendedor"

- Botão no canto superior direito do header. **Visível apenas para Owner/Gestor**
  (oculto para Vendedor, que já é um único vendedor).
- Ao clicar, alterna o gráfico para **modo "Por vendedor"**: substitui a linha única
  de Vendas por **uma linha de faturamento acumulado por vendedor** (top 6 vendedores
  por faturamento no escopo; demais agregados em "Outros", cores distintas). Objetivo
  permanece (tracejado) como referência; Previsão e
  comparativos ficam ocultos nesse modo. Clicar de novo volta ao consolidado.
- Decisão: **toggle in-place** (não modal) — menor superfície de UI, reusa os mesmos
  eixos, leitura direta de "quem está puxando/segurando o ritmo".

## 6. Arquitetura / dados

### 6.1 Util puro — `src/features/sales-analytics/utils/evolution.ts`

- `buildDailyEvolution(input): IDailyEvolutionPoint[]` — função pura, testável isolada,
  no espírito de `goals/utils/composition.ts#buildEvolutionSeries`.
- Entrada: pedidos das 3 janelas (mês atual, mês anterior, mesmo mês ano anterior),
  `targetValue` da meta, `referenceDate` (hoje).
- Saída por dia: `{ day, weekdayLabel, isWeekend, vendas, objetivo, previsao, mesPassado, anoPassado }`.
- Helper adicional para o modo vendedor: `buildSellerEvolution(...)` →
  `{ sellerId, sellerName, color, data: (number|null)[] }[]`.
- Apenas pedidos `paymentStatus === "pago"`, bucket por `paidAt ?? createdAt`,
  acumulação por dia-do-mês.

### 6.2 Hook — `src/features/sales-analytics/hooks/useSalesEvolution.ts`

- Recebe o `scope` (`storeId`/`sellerId`) já resolvido pela página (RBAC) — **não usa**
  o filtro de período da `SalesHeader` (é sempre "mês atual").
- 3 queries `useQuery` (`useOrdersProvider`) para as janelas mês atual / mês anterior /
  mesmo mês ano anterior, filtrando `paymentStatus: "pago"`.
- Resolve o **Objetivo** via goals: meta ativa `metric: "revenue"`, `period.type:
"monthly"` do escopo — meta **individual** quando `scope.sellerId` definido, senão
  meta da **loja** (`useStoreGoals` / `useGoalsWithProgress`). Sem meta ativa →
  `objetivo` ausente e aviso sutil ("Sem meta definida") no lugar da linha.
- Retorna: série diária consolidada, séries por vendedor, `targetValue`, KPIs derivados
  (realizado, esperado hoje, projeção, gap), flags `isLoading` / `hasError` / `hasGoal`.
- Para o modo vendedor: lista de vendedores via `useSellersProvider`, restrita ao escopo.

### 6.3 Componente — `src/features/sales-analytics/components/charts/SalesEvolutionChart.tsx`

- `ComposedChart` do Recharts: `Area` (Vendas) + múltiplas `Line`; `ReferenceLine`
  vertical em hoje; tick customizado do `XAxis` (dia + dia-da-semana, fim de semana
  esmaecido); sombreamento de fim de semana via `ReferenceArea`.
- Header: título "Evolução de Venda" + ícone, subtítulo, botão "Detalhar por vendedor".
- Strip de KPIs (seção 4). Legenda de chips toggláveis (seção 3). Estados
  loading/vazio/sem-meta.
- Props: `{ data, sellerData, kpis, hasGoal, canDrillDown, isLoading }`. Estado de UI
  (séries visíveis, modo vendedor) é **local** ao componente.

### 6.4 i18n — `src/features/sales-analytics/i18n/pt-BR.ts`

- Novas chaves em `SALES_ANALYTICS_STRINGS`: título, subtítulos (consolidado/vendedor),
  labels das 5 séries, labels dos KPIs, label do botão, aviso "sem meta", legenda
  da linha "Hoje".

### 6.5 Integração — `src/features/sales-analytics/components/tabs/SalesOverviewTab.tsx` + página

- Renderizar `<SalesEvolutionChart>` como primeiro filho da overview, full-width.
- A página (`SalesAnalyticsPage`) passa `scope` e papel (para `canDrillDown`) ao hook/
  componente. RBAC já existente é reutilizado.

## 7. Fora de escopo (YAGNI)

- Sem seletor de métrica (fixo em **Faturamento**).
- Sem persistência de toggles/modo em localStorage.
- Sem remoção/alteração do `RevenueOverTimeChart`.
- Sem suite de testes nova além de, opcionalmente, testar o util puro (não há runner
  configurado no projeto; será validado por type-check via `bun run build` e teste
  manual do usuário).

## 8. Riscos / pontos de atenção

- **Datas dos mocks** são relativas a `new Date()` — o "hoje" do gráfico é a data real
  de runtime; comparativos do ano anterior podem ter volume baixo conforme o gerador.
- **Tema:** garantir contraste das séries categóricas em light e dark mode.
- **Escopo Vendedor:** botão de detalhe oculto; Objetivo deve usar meta individual.
- Performance: janelas limitadas a pageSize suficiente (mês atual + 2 comparativos),
  acumulação O(n) por dia.
