/**
 * User-facing strings for the Sales Analytics feature (PRD-041).
 * All copy in Brazilian Portuguese with correct diacritics.
 */
export const SALES_ANALYTICS_STRINGS = {
  pageTitle: "Vendas",
  pageSubtitle: "Análise detalhada de receita, produtos, clientes e funil",

  // Tabs
  tabOverview: "Visão geral",
  tabProducts: "Produtos",
  tabCustomers: "Clientes",
  tabFunnel: "Funil",

  // Filters
  filtersTitle: "Filtros",
  filterPeriod: "Período",
  filterStore: "Loja",
  filterSeller: "Vendedor",
  filterCategory: "Categoria",
  filterVehicleBrand: "Marca do veículo",
  filterChannel: "Canal",
  filterAll: "Todos",
  filterAllStores: "Todas as lojas",
  filterAllSellers: "Todos os vendedores",
  filterAllCategories: "Todas as categorias",
  filterAllBrands: "Todas as marcas",
  filterAllChannels: "Todos os canais",
  reset: "Limpar filtros",

  // Period presets
  periodToday: "Hoje",
  periodYesterday: "Ontem",
  period7d: "Últimos 7 dias",
  period30d: "Últimos 30 dias",
  period90d: "Últimos 90 dias",
  periodYtd: "Ano até hoje",
  periodCustom: "Personalizado",

  // KPIs
  kpiRevenue: "Faturamento",
  kpiRevenueShort: "Faturamento",
  kpiRevenueHelp: "Soma de pedidos pagos no período",
  kpiOrders: "Pedidos pagos",
  kpiOrdersShort: "Pedidos",
  kpiOrdersHelp: "Quantidade de pedidos com pagamento confirmado",
  kpiAvgTicket: "Ticket médio",
  kpiAvgTicketShort: "Ticket médio",
  kpiAvgTicketHelp: "Faturamento ÷ pedidos pagos",
  kpiMargin: "Margem média",
  kpiMarginShort: "Margem",
  kpiMarginHelp: "% médio sobre pedidos pagos (placeholder — PRD-049)",
  kpiNoData: "Sem dados",
  kpiVsPrevious: "vs período anterior",
  kpiTrendUp: "subiu",
  kpiTrendDown: "caiu",
  kpiTrendFlat: "estável",

  // Charts
  chartRevenueOverTime: "Faturamento ao longo do tempo",
  chartRevenueOverTimeHelp: "Últimos 12 meses",
  chartCategory: "Distribuição por categoria",
  chartCategoryHelp: "% da receita por família de peça",
  chartVehicleBrand: "Vendas por marca de veículo",
  chartVehicleBrandHelp: "Faturamento por marca aplicada",
  chartChannel: "Vendas por canal",
  chartChannelHelp: "Distribuição da origem dos pedidos",
  chartEmpty: "Sem dados no período",

  // Evolution chart (mês atual)
  evolutionTitle: "Evolução de venda",
  evolutionSubtitle: "Faturamento acumulado diário — comparado à meta do mês",
  evolutionSubtitleSeller: "Faturamento acumulado por vendedor — mês atual",
  evolutionSeriesVendas: "Vendas no mês",
  evolutionSeriesObjetivo: "Objetivo",
  evolutionSeriesPrevisao: "Previsão de vendas",
  evolutionSeriesMesPassado: "Mês passado",
  evolutionSeriesAnoPassado: "Ano passado",
  evolutionToday: "Hoje",
  evolutionTooltipSoldToday: "Vendido no dia",
  evolutionOutros: "Outros",
  evolutionDrillDown: "Detalhar por vendedor",
  evolutionDrillDownBack: "Voltar ao consolidado",
  evolutionNoGoal: "Sem meta definida para o mês",
  evolutionKpiRealized: "Realizado (até hoje)",
  evolutionKpiTarget: "Meta do mês",
  evolutionKpiProjection: "Projeção fim do mês",
  evolutionKpiGap: "Gap projetado",
  evolutionKpiOfTarget: "da meta",
  evolutionKpiExpectedToday: "esperado hoje",
  evolutionKpiRealizedPct: "realizado",
  evolutionKpiBelow: "abaixo da meta",
  evolutionKpiAbove: "acima da meta",

  // Seasonality
  seasonalityTitle: "Sazonalidade detectada",
  seasonalityHighlight: "Pico do período",
  seasonalityVsYearAgo: "vs mesmo mês do ano anterior",

  // Products tab
  productsTabTitle: "Top 20 produtos mais vendidos",
  productsCategoryPerformance: "Performance por categoria",
  productsInDecline: "Produtos em queda",
  productsInDeclineHelp: "Produtos com queda superior a 30% vs período anterior",
  productsInDeclineEmpty: "Nenhum produto em queda significativa no período",
  productsTableProduct: "Produto",
  productsTableCategory: "Categoria",
  productsTableQty: "Qtd",
  productsTableRevenue: "Receita",
  productsTableShare: "% receita",
  productsTableTrend: "Tendência",
  productsEmpty: "Nenhum produto vendido no período",

  // Customers tab
  customersTabTitle: "Top 20 clientes compradores",
  customersTableCustomer: "Cliente",
  customersTableClass: "Classe",
  customersTableOrders: "Pedidos",
  customersTableRevenue: "Receita",
  customersTableAvgTicket: "Ticket médio",
  customersTableSeller: "Vendedor",
  customersNewVsRecurring: "Novos vs recorrentes",
  customersNewLabel: "Novos clientes",
  customersRecurringLabel: "Recorrentes",
  customersEmpty: "Nenhum cliente comprou no período",

  // Funnel tab
  funnelTitle: "Funil de conversão",
  funnelSubtitle: "Da geração de leads até o pedido pago",
  funnelStageLeads: "Leads no período",
  funnelStageQualified: "Qualificados",
  funnelStageQuotesSent: "Orçamentos enviados",
  funnelStageQuotesAccepted: "Orçamentos aceitos",
  funnelStageOrdersPaid: "Pedidos pagos",
  funnelStageOf: "dos anteriores",
  funnelBottleneck: "Maior gargalo",
  funnelHealthy: "Funil saudável",
  funnelSampleLink: "Ver todos",
  funnelEmpty: "Sem dados de funil no período",

  // Access
  accessDeniedTitle: "Acesso restrito",
  accessDeniedDescription:
    "A análise de vendas é visível apenas para perfis com acesso a indicadores comerciais.",
  accessDeniedAction: "Voltar ao início",

  // Channel labels (canonical)
  channelLabelWhatsapp: "SDR / WhatsApp",
  channelLabelManual: "Manual",
  channelLabelPortal: "Portal",
  channelLabelEcommerce: "E-commerce",

  // ABC class labels
  abcClassA: "A",
  abcClassB: "B",
  abcClassC: "C",
} as const;
