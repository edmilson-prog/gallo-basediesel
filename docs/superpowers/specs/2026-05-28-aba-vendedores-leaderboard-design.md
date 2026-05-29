# Design — Aba "Vendedores" (leaderboard + drawer de detalhe)

**Data:** 2026-05-28
**Feature:** `sales-analytics`
**Rota alvo:** `/app/gestao/vendas` (nova aba "Vendedores")
**Status:** Aprovado (brainstorming) — pronto para plano de implementação

---

## 1. Objetivo

Elevar o "detalhar por vendedor": hoje ele é raso (apenas um toggle no
`SalesEvolutionChart` que troca as linhas do gráfico por séries cumulativas por
vendedor). Esta entrega adiciona uma **experiência completa de detalhamento e ranking
por vendedor** numa aba dedicada. O toggle do gráfico **não é removido** — passa a ser
apenas um atalho rápido in-context, enquanto a aba nova é a análise profunda (ver §2).
Referência visual: o "Ranking de vendedores" da plataforma Mercos (print fornecido
pelo usuário) — porém repaginado, com hierarquia visual, gamificação leve e
drill-down, evitando a tabela cinza/plana e o scroll horizontal datado do original.

Direção de design aprovada: **híbrido — leaderboard (com pódio) + drawer de detalhe**,
em uma **aba dedicada**.

## 2. Posicionamento e escopo

- **Nova aba "Vendedores"** na `SalesAnalyticsPage`, posicionada **entre "Visão geral"
  e "Produtos"** na `TabsList`. Ícone: `mdi:trophy-outline` (ou `mdi:podium`).
- O **toggle "Detalhar por vendedor" do `SalesEvolutionChart` permanece intacto** na
  aba "Visão geral" — serve a um propósito diferente (drill rápido in-context). A aba
  nova é a análise profunda. Sem conflito, sem remoção.
- Reaproveita os **filtros globais existentes** (`useSalesFilters`: período, loja) e o
  `scope` já resolvido na página. Não cria filtros próprios além do **seletor de
  métrica de ranqueamento** (ver §4).

### RBAC

- **Owner / Gestor:** veem a aba completa (ranking de todos os vendedores do escopo).
- **Vendedor:** vê a aba, mas renderizada em **modo "minha posição"** — apenas o
  próprio card/linha (sua posição no ranking, métricas e drawer dele), **sem** expor
  colegas. Motiva sem quebrar privacidade.
- **Demais papéis** (`Financeiro` e fora do `ALLOWED_ROLES`): aba **não aparece**.
- A aba é incluída em `TAB_DEFS` condicionalmente conforme o papel.

## 3. Estrutura interna da aba (de cima para baixo)

1. **Header de resumo** — mini-cards: nº de vendedores ativos, faturamento
   consolidado do período, % médio de atingimento de meta; + **seletor de métrica de
   ranqueamento** (segmented control).
2. **Pódio (top 3)** — cards com medalha ouro/prata/bronze, inicial do vendedor
   (monocromática, sem avatar falso), valor da métrica ativa e % da meta. **Renderiza
   apenas quando há ≥4 vendedores** no ranking; com menos, é omitido (evita pódio
   vazio) e a lista assume o topo.
3. **Leaderboard (4º em diante, ou lista completa quando sem pódio)** — linhas
   enxutas e clicáveis: posição (badge), nome, **barra de progresso de meta** (cor por
   faixa), valor da métrica ativa, **seta de tendência** (▲▼ vs mês anterior) e chevron
   `›`.
4. **Drawer de detalhe** (`Sheet` lateral do shadcn) — aberto ao clicar em qualquer
   vendedor (pódio ou linha). Contém **todas as métricas** + **gráfico cumulativo
   individual** (vendas vs meta vs previsão) + lista resumida de orçamentos em aberto.
5. **Toggle "Ver como tabela"** — botão no header que troca o leaderboard pela
   **tabela densa premium** (mesmos dados, renderização tabular). v1 com colunas fixas;
   **sem** menu de visibilidade de colunas (YAGNI).

## 4. Métrica de ranqueamento

Segmented control no header. Opções (default = **Valor vendido**):

| Métrica       | Ordenação            |
| ------------- | -------------------- |
| Valor vendido | `revenue` desc       |
| % da meta     | `attainmentPct` desc |
| Nº de pedidos | `orderCount` desc    |
| Ticket médio  | `avgTicket` desc     |

A métrica ativa governa a ordenação do ranking, o valor exibido nos cards do pódio e
na coluna principal de valor do leaderboard. As demais métricas ficam disponíveis no
drawer/tabela.

## 5. Dados e cálculo — hook `useSellerLeaderboard`

Novo hook em `src/features/sales-analytics/hooks/useSellerLeaderboard.ts`. Recebe
`{ scope, window }` (período/loja já resolvidos) e a métrica ativa. Agrega **por
vendedor** via os providers existentes (`useOrdersProvider`, `useSellersProvider`,
`useQuotesProvider`, `useGoalsWithProgress`, e positivação quando disponível), tudo
memoizado e com TanStack Query (drop-in Mock→Supabase preservado).

Saída por vendedor (`ISellerLeaderboardRow`):

| Campo                                     | Origem                                                       |
| ----------------------------------------- | ------------------------------------------------------------ |
| `sellerId`, `sellerName`                  | `ISeller` (usa `fullName`)                                   |
| `revenue`, `orderCount`, `avgTicket`      | `IOrder` pagos do período (`sellerId`)                       |
| `target`, `attainmentPct`                 | `IGoal` nível `individual`, métrica `revenue`, do mês        |
| `projection`                              | run-rate (reaproveita lógica de `computeEvolutionKpis`)      |
| `attainmentForecastPct`                   | `projection / target`                                        |
| `trend` (`up`/`down`/`flat`) + `trendPct` | faturamento mês atual vs mês anterior (`computeTrend`)       |
| `positivedCustomers`, `customerCount`     | `IPositivation` + customers do vendedor                      |
| `quoteCount`, `openQuotesValue`           | `IQuote` (`sellerId`, status aberto)                         |
| `dailySeries`                             | série diária cumulativa (reaproveita `buildSellerEvolution`) |

O hook também devolve os **agregados do header** (totais/médias) e a posição/rank de
cada linha após ordenar pela métrica ativa.

Para o **modo Vendedor**, o hook filtra a saída ao próprio `sellerId`, mas mantém a
posição real (rank) calculada sobre o conjunto completo.

## 6. Faixas de cor da meta (com sinal redundante)

A cor **sempre** acompanha um ícone/sinal (acessibilidade — nunca cor sozinha):

- `< 70%` → `destructive`
- `70%–99%` → `warning`
- `≥ 100%` → `success`

Consumir **apenas tokens semânticos** (`success`/`warning`/`destructive`/`primary`,
`bg-*/10` para fundos de barra/badge). Cor primária varia por tema de marca, então a
leitura de performance se apoia em success/warning/destructive, não em `primary`.
Medalhas do pódio podem usar tons fixos ouro/prata/bronze (semântica universal),
restritos ao próprio elemento da medalha.

## 7. Estados e microinterações

- **Loading:** skeletons com a mesma estrutura (pódio + linhas), nunca spinner.
- **Empty:** `EmptyState` "Nenhuma venda no período" + CTA para ajustar filtro.
- **< 4 vendedores:** sem pódio, somente lista.
- **Hover de linha:** realce `bg-muted/50`.
- **Clique:** abre o drawer (slide-in) e grava `?vendedor=<id>` na URL (deep-link
  compartilhável; abrir a aba com esse param já abre o drawer correspondente).
- **Números tabulares** (`tabular-nums`) em todas as métricas.
- `prefers-reduced-motion` respeitado nas animações de drawer/barras.

## 8. Componentização

Tudo sob `src/features/sales-analytics/`:

- `hooks/useSellerLeaderboard.ts` — agregação + ranking (responsabilidade única de dados).
- `components/sellers/SellersTab.tsx` — orquestra header + pódio + leaderboard/tabela + drawer; controla métrica ativa, toggle de tabela e estado do drawer (sincronizado com `?vendedor`).
- `components/sellers/SellersSummaryHeader.tsx` — mini-cards + segmented de métrica.
- `components/sellers/SellerPodium.tsx` — top 3.
- `components/sellers/SellerLeaderboardRow.tsx` — linha do leaderboard.
- `components/sellers/SellersTable.tsx` — visão densa premium (toggle).
- `components/sellers/SellerDetailDrawer.tsx` — `Sheet` com métricas + gráfico individual + orçamentos.
- Strings em `i18n/pt-BR.ts` (chaves novas, pt-BR com acentos).
- Tipos `ISellerLeaderboardRow` / `ISellerLeaderboardSummary` exportados pela feature.

## 9. Fora de escopo (YAGNI)

- Menu de visibilidade/ordem de colunas na tabela.
- Exportação para Excel/CSV (pode entrar depois).
- Persistência da métrica ativa ou do modo tabela em localStorage.
- Gamificação avançada (badges, conquistas) — já existe modelo `IGamificationBadge`,
  mas não faz parte desta entrega.
- Avatares reais de vendedor (usar iniciais monocromáticas).

## 10. Não regredir

- Toggle "Detalhar por vendedor" do `SalesEvolutionChart` (Visão geral) continua
  funcionando exatamente como hoje.
- Demais abas (Produtos/Clientes/Funil) e os filtros globais intactos.
- `ISeller` usa `fullName` em todo o código novo.
- Padrão de providers (Mock→Supabase) e consumo somente de tokens semânticos.
