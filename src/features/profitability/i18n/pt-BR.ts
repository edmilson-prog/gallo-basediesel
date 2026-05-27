/** Brazilian Portuguese strings for the Profitability feature (PRD-049). */
export const PROFITABILITY_STRINGS = {
  pageTitle: "Rentabilidade",
  pageSubtitle:
    "Análise multidimensional de margem — produtos, categorias, clientes e vendedores. Identifica pontos críticos e oportunidades a partir do custo unitário.",

  filtersAnchor: "Mês de referência",
  filtersSeller: "Vendedor",
  filtersCategory: "Categoria",
  filtersBrand: "Marca",
  filterSellerAll: "Todos os vendedores",
  filterCategoryAll: "Todas as categorias",
  filterBrandAll: "Todas as marcas",

  tabProduct: "Por Produto",
  tabCategory: "Por Categoria",
  tabCustomer: "Por Cliente",
  tabSeller: "Por Vendedor",

  kpiAvgMargin: "Margem média",
  kpiAvgMarginHelp: "Margem consolidada sobre receita líquida.",
  kpiCoverage: "Cobertura de custo",
  kpiCoverageHelp: "Itens com custo cadastrado.",
  kpiNegative: "Produtos negativos",
  kpiNegativeHelp: "Itens com margem < 0%.",
  kpiTopProduct: "Maior margem (R$)",
  kpiTopProductHelp: "Produto líder por margem absoluta.",

  tableProductHeader: "Produto",
  tableSkuHeader: "SKU / OEM",
  tableRevenue: "Receita",
  tableCost: "Custo",
  tableMargin: "Margem (R$)",
  tableMarginPct: "Margem (%)",
  tableItems: "Itens",
  tableOrders: "Pedidos",

  subfilterAll: "Todos os produtos",
  subfilterNegative: "Apenas margem negativa",
  subfilterMissingCost: "Sem custo cadastrado",

  productEmpty: "Nenhum produto vendido no período.",
  categoryEmpty: "Nenhuma venda registrada por categoria.",
  customerEmpty: "Nenhum cliente comprou no período.",
  sellerEmpty: "Nenhum vendedor com pedidos no período.",

  categoryChartTitle: "Margem média por categoria",
  categoryChartHelp: "Comparativo de margem decimal entre categorias.",

  customerNegativeFilter: "Apenas clientes com margem negativa",
  sellerDiscountColumn: "Desconto médio",

  coverageHint: (pct: number, missing: number, parts: number) =>
    `Análise sobre ${pct.toFixed(0)}% dos itens (${missing} sem custo, ${parts} peça${parts === 1 ? "" : "s"}).`,
  coverageCta: "Ver peças sem custo",

  trendUp: "↑",
  trendDown: "↓",
  trendFlat: "→",

  blockedTitle: "Acesso restrito",
  blockedDescription:
    "A análise de rentabilidade é estratégica e visível apenas para Owner, Gestor e Financeiro.",

  pageEmptyTitle: "Sem vendas no período",
  pageEmptyDescription:
    "Selecione outro mês ou ajuste os filtros — não há pedidos pagos para calcular margem.",
} as const;
