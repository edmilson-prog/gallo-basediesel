/**
 * User-facing strings for the Portfolio Analytics feature (PRD-046).
 * All copy in Brazilian Portuguese with correct diacritics.
 */
export const PORTFOLIO_STRINGS = {
  pageTitle: "Carteira Analítica",
  pageSubtitle: "Saúde geral da carteira — distribuição, churn, recuperação e risco",
  drillTitle: "Carteira por vendedor",

  // Filters
  filterPeriod: "Período de análise",
  filterStore: "Loja",
  filterSeller: "Vendedor",
  filterAllStores: "Todas as lojas",
  filterAllSellers: "Todos os vendedores",
  reset: "Limpar filtros",

  // Period presets
  periodMonthCurrent: "Mês atual",
  periodQuarterCurrent: "Trimestre atual",
  periodSemesterCurrent: "Semestre atual",
  periodYtd: "Ano até hoje",
  periodRolling12m: "Últimos 12 meses",
  periodCustom: "Personalizado",

  // Status labels
  statusAtivo: "Ativos",
  statusDormente: "Dormentes",
  statusPerdido: "Perdidos",
  statusRecuperacao: "Em recuperação",

  // KPIs
  kpiTotal: "Total da carteira",
  kpiTotalHelp: "Clientes em todos os status",
  kpiActivePct: "Taxa de ativos",
  kpiActivePctHelp: "Clientes que compraram dentro do período recente",
  kpiDormantPct: "Taxa de dormentes",
  kpiDormantPctHelp: "Sem compras entre o limite de dormente e perdido",
  kpiLostPct: "Taxa de perdidos",
  kpiLostPctHelp: "Sem compras há mais do que o limite configurado",
  kpiChurn: "Churn no período",
  kpiChurnHelp: "Clientes que saíram de ativo (para dormente ou perdido)",
  kpiRecovery: "Recuperação no período",
  kpiRecoveryHelp: "Dormentes ou perdidos que voltaram a comprar",
  kpiGrowth: "Crescimento líquido",
  kpiGrowthHelp: "Novos clientes menos churn de ativos",

  // Sections
  sectionDistribution: "Distribuição por status",
  sectionEvolution: "Evolução temporal",
  sectionTransitions: "Transições no período",
  sectionBySeller: "Saúde por vendedor",
  sectionAtRiskImminent: "Em risco iminente (próximos 15 dias para dormente)",
  sectionAtRiskCritical: "Em risco crítico (próximos 15 dias para perdido)",

  // Distribution chart
  distributionEmpty: "Nenhum cliente no escopo",

  // Evolution chart
  evolutionLegendAtivo: "Ativos",
  evolutionLegendDormente: "Dormentes",
  evolutionLegendPerdido: "Perdidos",
  evolutionEmpty: "Sem dados para construir a série temporal",
  evolutionAxisCount: "Clientes",

  // Transitions
  transitionActiveToDormant: "Ativo → Dormente",
  transitionActiveToLost: "Ativo → Perdido",
  transitionDormantToLost: "Dormente → Perdido",
  transitionDormantToActive: "Dormente → Ativo (recuperação)",
  transitionLostToActive: "Perdido → Ativo (recuperação rara)",
  transitionNew: "Novos clientes",

  // By-seller table
  tableSeller: "Vendedor",
  tablePortfolio: "Carteira",
  tableActive: "% Ativos",
  tableDormant: "% Dormentes",
  tableLost: "% Perdidos",
  tableChurn: "Churn",
  tableRecovery: "Recuperação",
  tableHealth: "Health Score",
  tableActions: "Ações",
  tableDrillAction: "Abrir drill-down",
  tableEmpty: "Nenhum vendedor com carteira no escopo",

  // Risk lists
  riskColumnCustomer: "Cliente",
  riskColumnSeller: "Vendedor",
  riskColumnLastPurchase: "Última compra",
  riskColumnDays: "Dias restantes",
  riskColumnAction: "Ações",
  riskActionContact: "Contatar",
  riskActionOpen: "Abrir ficha",
  riskNoPurchase: "Sem compras",
  riskEmptyImminent: "Nenhum cliente ativo perto do limite de dormente.",
  riskEmptyCritical: "Nenhum dormente perto de virar perdido.",
  riskDaysLabel: (days: number) => (days === 1 ? "1 dia" : `${days} dias`),
  contactToastFallback: (name: string) => `Abrindo conversa com ${name}…`,

  // Health qualitative
  healthExcellent: "Excelente",
  healthGood: "Bom",
  healthAttention: "Atenção",
  healthCritical: "Crítico",

  // Access
  accessDeniedTitle: "Acesso restrito",
  accessDeniedDescription:
    "A carteira analítica expõe dados estratégicos da base de clientes. Disponível para Owner, Gestor e Vendedor (escopo limitado).",
  accessDeniedAction: "Voltar ao início",
  sellerNotFoundTitle: "Vendedor não encontrado",
  sellerNotFoundDescription: "O vendedor informado não existe na loja atual.",

  // Drill-down
  drillBack: "Voltar à carteira analítica",
  drillTabsAll: "Todos",
  drillTabsActive: "Ativos",
  drillTabsDormant: "Dormentes",
  drillTabsLost: "Perdidos",
  drillTabsRecovery: "Em recuperação",
  drillListEmpty: "Nenhum cliente neste status",

  // Widget (PRD-014)
  widgetTitle: "Saúde da carteira",
  widgetSubtitle: (active: number, total: number) =>
    `${active} ativos de ${total} clientes`,
  widgetOpen: "Abrir análise",
  widgetEmpty: "Sem dados de carteira no momento.",

  // Errors
  errorTitle: "Falha ao carregar carteira analítica",
  errorMessage: "Tente novamente ou recarregue a página.",
  errorRetry: "Tentar novamente",
} as const;
