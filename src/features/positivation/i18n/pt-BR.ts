/**
 * User-facing strings for the Positivation feature (PRD-044).
 * All copy in Brazilian Portuguese with correct diacritics.
 */
export const POSITIVATION_STRINGS = {
  pageTitle: "Positivação",
  pageSubtitle: "Cobertura da carteira — quem comprou no período",
  drillTitle: "Positivação por vendedor",

  // Filters
  filterPeriod: "Período",
  filterStore: "Loja",
  filterSeller: "Vendedor",
  filterAllStores: "Todas as lojas",
  filterAllSellers: "Todos os vendedores",
  reset: "Limpar filtros",

  // Period presets
  periodMonthCurrent: "Mês atual",
  periodMonthPrevious: "Mês anterior",
  periodQuarterCurrent: "Trimestre atual",
  periodYtd: "Ano até hoje",
  periodCustom: "Personalizado",

  // KPIs
  kpiBase: "Base elegível",
  kpiBaseHelp: "Clientes ativos no escopo",
  kpiPositivated: "Positivados",
  kpiPositivatedHelp: "Clientes com pelo menos 1 pedido pago no período",
  kpiRate: "Taxa de positivação",
  kpiRateHelp: "Positivados ÷ base",
  kpiProjection: "Projeção fim do período",
  kpiProjectionHelp: "Extrapolação linear do ritmo atual",
  kpiAtRisk: "Em risco",
  kpiAtRiskHelp: "Clientes a poucos dias de virarem dormentes",
  kpiVsPrevious: "vs período anterior",

  // Sections
  sectionEvolution: "Evolução acumulada",
  sectionBySeller: "Por vendedor",
  sectionNotPositivated: "Clientes não positivados",
  sectionAtRisk: "Clientes em risco",

  // Evolution chart
  chartCumulative: "Positivados (acumulado)",
  chartExpected: "Esperado (linha proporcional)",
  chartEmpty: "Sem dados no período",
  chartAxisDay: "dia",

  // By seller table
  tableSeller: "Vendedor",
  tablePortfolio: "Carteira",
  tablePositivated: "Positivados",
  tableRate: "Taxa",
  tableProjection: "Projeção",
  tableAtRiskCount: "Em risco",
  tableActions: "Ações",
  tableDrillAction: "Abrir drill-down",
  tableEmpty: "Nenhum vendedor com clientes ativos no escopo",

  // Customer lists
  customerLastPurchase: "Última compra",
  customerNoPurchase: "Sem compras",
  customerSeller: "Vendedor",
  customerStore: "Loja",
  customerContact: "Contatar",
  customerOpenProfile: "Abrir ficha",
  customerAtRiskBadge: "Em risco",
  customerDaysUntilDormant: (days: number) =>
    days === 1 ? "1 dia para dormente" : `${days} dias para dormente`,
  customersEmptyNotPositivated: "Todos os clientes positivaram no período. 🎯",
  customersEmptyAtRisk: "Nenhum cliente em risco no momento.",
  contactToastFallback: (name: string) => `Abrindo conversa com ${name}…`,

  // Pagination
  paginationShow: "Mostrar",
  paginationPrev: "Anterior",
  paginationNext: "Próximo",

  // Drill-down
  drillBack: "Voltar à positivação",
  drillKpiPortfolio: "Carteira do vendedor",
  drillTabsAll: "Todos",
  drillTabsPositivated: "Positivados",
  drillTabsPending: "Não positivados",
  drillTabsAtRisk: "Em risco",

  // Access
  accessDeniedTitle: "Acesso restrito",
  accessDeniedDescription:
    "A positivação mostra dados estratégicos da carteira e é visível apenas para Owner, Gestor e Vendedor (escopo limitado).",
  accessDeniedAction: "Voltar ao início",
  sellerNotFoundTitle: "Vendedor não encontrado",
  sellerNotFoundDescription: "O vendedor informado não existe na loja atual.",

  // Widget (PRD-014)
  widgetTitle: "Positivação do mês",
  widgetSubtitle: (positivated: number, total: number) => `${positivated} de ${total} clientes`,
  widgetViewAll: "Abrir",
  widgetEmpty: "Sem base elegível para positivar.",
} as const;
