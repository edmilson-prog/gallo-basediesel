export const INSIGHTS_STRINGS = {
  pageTitle: "Insights",
  pageSubtitle: "Padrões detectados automaticamente que merecem atenção.",

  // Tabs
  tabActive: "Ativos",
  tabDismissed: "Dispensados",

  // KPI labels
  kpiTotal: "Insights ativos",
  kpiCritical: "Críticos",
  kpiMedium: "Médios",
  kpiOpportunity: "Oportunidades",

  // Filters
  filterCategoryLabel: "Categoria",
  filterCategoryAll: "Todas as categorias",
  filterCategoryFinancial: "Financeiro",
  filterCategoryCommercial: "Comercial",
  filterCategoryOperational: "Operacional",
  filterCategoryCustomer: "Cliente",
  filterPriorityLabel: "Prioridade",
  filterPriorityAll: "Todas as prioridades",
  filterPriorityCritical: "Crítico",
  filterPriorityMedium: "Médio",
  filterPriorityOpportunity: "Oportunidade",
  filterPriorityInfo: "Informativo",
  filterPeriodLabel: "Detectados nos",
  filterPeriod7d: "Últimos 7 dias",
  filterPeriod30d: "Últimos 30 dias",
  filterPeriod90d: "Últimos 90 dias",
  filterPeriodAll: "Sempre",
  filterClear: "Limpar filtros",

  // Card
  cardSeeContext: "Ver contexto",
  cardHideContext: "Ocultar contexto",
  cardDismiss: "Dispensar",
  cardDrillDown: "Investigar",
  cardDismissed: "Dispensado",
  cardDismissedBy: "Dispensado por",
  cardDismissedAt: "Em",
  cardDismissedReason: "Motivo",

  // Dismiss modal
  modalTitle: "Dispensar insight",
  modalDescription:
    "O insight some da lista ativa enquanto a janela de validade está aberta. Você pode reativá-lo manualmente em Dispensados.",
  modalReasonLabel: "Motivo (opcional)",
  modalReasonPlaceholder: "Ex.: ação em andamento, já avaliei...",
  modalCancel: "Cancelar",
  modalConfirm: "Dispensar insight",

  // Empty states
  emptyActiveTitle: "Nenhum insight ativo",
  emptyActiveDescription: "Quando o sistema detectar padrões relevantes, eles aparecerão aqui.",
  emptyDismissedTitle: "Nenhum insight dispensado",
  emptyDismissedDescription: "Insights que você dispensar ficarão arquivados aqui.",
  emptyDisabledTitle: "Insights desativados",
  emptyDisabledDescription: "Owner pode reativar em Configurações ▸ Insights.",
  blockedTitle: "Sem acesso a insights",
  blockedDescription: "Este recurso está disponível apenas para gestores e owner.",

  // Banner / widget
  bannerCriticalSingular: "1 insight crítico requer atenção",
  bannerCriticalPlural: (n: number) => `${n} insights críticos requerem atenção`,
  bannerCta: "Ver insights",
  widgetTitle: "Insights críticos",
  widgetEmpty: "Sem insights críticos no momento.",
  widgetSeeAll: "Ver todos",

  // Config page
  configPageTitle: "Configurações ▸ Insights",
  configToggleLabel: "Detecção de insights ativa",
  configToggleHint:
    "Quando desativado, o hub fica vazio e os widgets/banner não aparecem nas demais telas.",
  configThresholdsTitle: "Thresholds das heurísticas",
  configThresholdsHint:
    "Cada heurística usa um threshold dedicado. Aumentar o valor reduz a sensibilidade.",
  configLlmBannerTitle: "Detecção via IA real (LLM)",
  configLlmBannerBody:
    "Disponível na Fase 2. Atualmente os insights são gerados por heurísticas configuráveis.",
  configSaved: "Configurações de insights atualizadas.",

  // Common error
  errorTitle: "Não conseguimos calcular os insights.",
  errorRetry: "Tentar novamente",
} as const;

export const PRIORITY_LABEL: Record<string, string> = {
  critico: INSIGHTS_STRINGS.filterPriorityCritical,
  medio: INSIGHTS_STRINGS.filterPriorityMedium,
  oportunidade: INSIGHTS_STRINGS.filterPriorityOpportunity,
  info: INSIGHTS_STRINGS.filterPriorityInfo,
};

export const CATEGORY_LABEL: Record<string, string> = {
  financeiro: INSIGHTS_STRINGS.filterCategoryFinancial,
  comercial: INSIGHTS_STRINGS.filterCategoryCommercial,
  operacional: INSIGHTS_STRINGS.filterCategoryOperational,
  cliente: INSIGHTS_STRINGS.filterCategoryCustomer,
};
