/**
 * User-facing strings for the Executive Cockpit feature (PRD-040).
 * All copy in Brazilian Portuguese with correct diacritics.
 */
export const EXECUTIVE_COCKPIT_STRINGS = {
  pageTitle: "Visão Executiva",
  pageSubtitle: "Fotografia estratégica da empresa em uma tela",
  personalizeBtn: "Personalizar widgets",
  personalizeTooltip: "Disponível na Fase 2",

  // Filters
  filterPeriod: "Período",
  filterStore: "Loja",
  filterAllStores: "Todas as lojas",
  filterCompareLabel: "Comparar com",
  filterComparePrev: "Período anterior",
  filterCompareYoY: "Mesmo mês no ano anterior",

  // Period presets
  periodMonth: "Mês atual",
  periodQuarter: "Trimestre atual",
  periodYear: "Ano até hoje",
  periodCustom: "Personalizado",

  // KPI labels
  kpiRevenue: "Faturamento",
  kpiAvgTicket: "Ticket médio",
  kpiOrders: "Total de pedidos",
  kpiMargin: "Margem estimada",
  kpiActiveCustomers: "Clientes ativos",
  kpiPositivation: "Positivação",
  kpiChurn: "Churn do período",
  kpiNewCustomers: "Novos clientes",
  kpiOpenPipeline: "Pipeline aberto",
  kpiConversionRate: "Conversão orçamento→pedido",
  kpiPendingCommissions: "Comissões a pagar",
  kpiNps: "NPS",
  kpiNpsSoon: "Em breve",

  // KPI help (tooltips)
  kpiRevenueHelp: "Receita total de pedidos pagos no período selecionado.",
  kpiAvgTicketHelp: "Valor médio por pedido no período (faturamento ÷ número de pedidos).",
  kpiOrdersHelp:
    "Quantidade de pedidos no período, somando todas as origens (WhatsApp, e-commerce, portal, etc.).",
  kpiMarginHelp:
    "Margem de contribuição estimada sobre o faturamento. Valor projetado até a integração final dos custos.",
  kpiActiveCustomersHelp: "Clientes que compraram pelo menos uma vez no período.",
  kpiPositivationHelp:
    "Percentual da carteira que comprou no período (clientes positivados ÷ total da carteira).",
  kpiChurnHelp:
    "Clientes que passaram para 'perdido' no período, por ficarem muito tempo sem comprar.",
  kpiNewCustomersHelp: "Clientes que fizeram a primeira compra no período.",
  kpiOpenPipelineHelp: "Valor total dos orçamentos em aberto, ainda não convertidos em pedido.",
  kpiConversionRateHelp: "Percentual de orçamentos que viraram pedido no período.",
  kpiPendingCommissionsHelp:
    "Total de comissões a pagar aos vendedores no período. Valor estimado.",
  kpiNpsHelp: "Índice de satisfação dos clientes (Net Promoter Score). Disponível em breve.",

  kpiVsPrevious: "vs período anterior",
  kpiVsYoY: "vs ano anterior",
  kpiStub: "Estimativa",
  kpiTrendUp: "subiu",
  kpiTrendDown: "caiu",
  kpiTrendFlat: "estável",
  kpiTrendNoBase: "novo",

  // Sections
  sectionAlerts: "Alertas executivos",
  sectionKpis: "Indicadores estratégicos",
  sectionCharts: "Tendências",
  sectionComparison: "Comparativo de período",
  alertDismiss: "Dispensar",

  // Charts
  chartRevenueOrders: "Faturamento e pedidos (12 meses)",
  chartRevenueOrdersHelp: "Receita acumulada vs quantidade de pedidos pagos por mês",
  chartPortfolio: "Saúde da carteira",
  chartPortfolioHelp: "Distribuição por status do cliente",
  chartTopSellers: "Top vendedores",
  chartTopSellersHelp: "Top 5 vendedores por faturamento no período",
  chartABC: "Curva ABC (compacta)",
  chartABCHelp: "Concentração de receita por classe de cliente",
  chartEmpty: "Sem dados no período",

  // Status labels (carteira)
  statusAtivo: "Ativo",
  statusDormente: "Dormente",
  statusRecuperacao: "Recuperação",
  statusPerdido: "Perdido",

  // ABC
  abcClassA: "Classe A",
  abcClassB: "Classe B",
  abcClassC: "Classe C",

  // Comparison
  comparisonTitle: "Mês atual vs período anterior",
  comparisonRevenue: "Faturamento",
  comparisonOrders: "Pedidos",
  comparisonAvgTicket: "Ticket médio",
  comparisonImproved: "melhor",
  comparisonWorse: "pior",
  comparisonFlat: "estável",

  // Access
  accessDeniedTitle: "Acesso restrito",
  accessDeniedDescription:
    "A visão executiva mostra dados estratégicos completos e é visível apenas para Owner, Gestor e Financeiro.",
  accessDeniedAction: "Voltar ao início",

  // Drill-down labels
  drillKpi: "Ver detalhes",
} as const;
