/**
 * User-facing strings for the Gamification feature (PRD-043).
 * All copy in Brazilian Portuguese with correct diacritics.
 */
export const GAMIFICATION_STRINGS = {
  // Page
  pageTitle: "Ranking de Vendedores",
  pageSubtitle: "Pontuação, conquistas e disputa saudável",
  drillTitle: (name: string) => `Ranking — ${name}`,
  configTitle: "Gamificação",
  configSubtitle: "Regras de pontuação, badges e tracking",

  // Filters
  filterPeriod: "Período",
  filterStore: "Loja",
  filterAllStores: "Todas as lojas",
  reset: "Limpar filtros",
  periodMonthly: "Mês atual",
  periodQuarterly: "Trimestre atual",
  periodYearly: "Ano atual",

  // Podium
  podiumGold: "1º lugar",
  podiumSilver: "2º lugar",
  podiumBronze: "3º lugar",
  podiumScore: (n: number) => `${n.toLocaleString("pt-BR")} pontos`,
  podiumEmpty: "Pódio ainda sem dados — aguarde a primeira competição.",

  // Table
  tableHeaderPosition: "Posição",
  tableHeaderSeller: "Vendedor",
  tableHeaderStore: "Loja",
  tableHeaderScore: "Score",
  tableHeaderDelta: "Variação",
  tableHeaderBadges: "Conquistas",
  tableYou: "Você",
  tableNoData: "Nenhum vendedor com pontuação no período.",

  // Breakdown chips
  chipGoals: "Metas",
  chipCustomers: "Clientes",
  chipOrders: "Pedidos",
  chipBadges: "Bônus",

  // Recent badges card
  badgesHighlightTitle: "Conquistas em destaque",
  badgesHighlightSubtitle: "Mais raras desbloqueadas no período",
  badgesEmpty: "Nenhuma conquista nova ainda.",

  // Detail page
  detailScore: "Pontuação total",
  detailPosition: "Posição",
  detailBadgesCount: "Conquistas no período",
  detailQualitativeTop10: "Top 10%",
  detailQualitativeTop25: "Top 25%",
  detailQualitativeTop50: "Top 50%",
  detailQualitativeOther: "Em construção",
  detailBreakdownTitle: "De onde vêm os pontos",
  detailBadgesTitle: "Conquistas",
  detailHistoryTitle: "Histórico de pontuação",
  detailHistorySubtitle: "Últimos 6 períodos",
  backToRanking: "Voltar ao ranking",

  // Config
  configToggleActive: "Gamificação ativa",
  configToggleDescription:
    "Quando desativada, ranking e widgets ficam ocultos para todos os papéis.",
  configRulesTitle: "Regras de pontuação",
  configBadgesTitle: "Catálogo de conquistas",
  configThresholdHighTicket: "Limiar pedido high-ticket (R$)",
  configThresholdBigTicket: "Limiar ticket médio big-ticket (R$)",
  configPointsGoalCompleted: "Pontos por meta atingida",
  configPointsGoalExceeded: "Bônus quando meta > 120%",
  configPointsNewCustomer: "Pontos por novo cliente",
  configPointsPositivation: "Pontos por positivação",
  configPointsRecovery: "Pontos por recuperação",
  configPointsHighTicket: "Pontos por pedido high-ticket",
  configNotifyOnBadgeEarned: "Notificar conquista no app (toast)",
  configRecalcButton: "Recalcular agora",
  configSaveButton: "Salvar configurações",
  configDemoBanner:
    "Modo demonstração: pontuação será calibrada com o cliente após uso real. Mudanças geram registro de auditoria.",

  // Empty states
  emptyTitle: "Sem dados de gamificação",
  emptyDescription:
    "Ainda não há pedidos pagos, metas concluídas ou conquistas no período selecionado.",
  disabledTitle: "Gamificação desativada",
  disabledDescription:
    "Ative em Configurações → Gamificação para liberar ranking, badges e widgets.",
  errorTitle: "Falha ao carregar ranking",
  errorDescription: "Tente novamente ou recarregue a página.",
  retry: "Tentar novamente",

  // Access
  accessDeniedTitle: "Sem acesso",
  accessDeniedDescription: "Você não tem permissão para visualizar este ranking.",
  accessDeniedAction: "Voltar ao início",

  // Widget — Painel Gestor
  widgetTopPerformersTitle: "Top performers do mês",
  widgetTopPerformersCta: "Ver ranking completo",

  // Widget — Cockpit
  widgetCockpitTitle: "Highlights do ranking",
  widgetCockpitSubtitle: "Quem está liderando",

  // Rarity labels
  raritiesCommon: "comum",
  raritiesRare: "rara",
  raritiesEpic: "épica",
  raritiesLegendary: "lendária",
} as const;

export type GamificationStrings = typeof GAMIFICATION_STRINGS;
