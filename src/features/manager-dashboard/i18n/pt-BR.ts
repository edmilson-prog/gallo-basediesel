/**
 * UI strings for the Manager Dashboard (PRD-014).
 *
 * Keeps all user-facing copy outside the components — Portuguese (pt-BR) only
 * on the MVP. The future Supabase phase will reuse the same shape.
 */
export const MANAGER_DASHBOARD_STRINGS = {
  pageTitle: "Painel do Gestor",
  pageSubtitle: "Visão operacional em tempo real da sua equipe e carteira",

  // Filters
  filterPeriod: "Período",
  filterSeller: "Vendedor",
  filterStore: "Loja",
  filterChannel: "Canal",
  filterCustomRange: "Período personalizado",
  allOption: "Todos",
  allStoresOption: "Todas as lojas",
  allSellersOption: "Todos os vendedores",
  allChannelsOption: "Todos os canais",
  resetFilters: "Limpar filtros",
  openSettings: "Configurar alertas",

  // Period labels
  periodToday: "Hoje",
  periodYesterday: "Ontem",
  period7d: "Últimos 7 dias",
  period30d: "Últimos 30 dias",
  periodCustom: "Personalizado",

  // KPI labels
  kpiTmaLabel: "Tempo Médio de Atendimento",
  kpiTmaShort: "TMA",
  kpiTmaHelp: "Tempo médio entre a primeira mensagem do cliente e a marcação como resolvida.",
  kpiTmrLabel: "Tempo Médio de Resposta",
  kpiTmrShort: "TMR",
  kpiTmrHelp: "Tempo médio entre uma mensagem do cliente e a primeira resposta do vendedor.",
  kpiResolutionLabel: "Taxa de Resolução",
  kpiResolutionShort: "Taxa de Resolução",
  kpiResolutionHelp: "Conversas resolvidas sobre conversas abertas no período.",
  kpiBacklogLabel: "Backlog",
  kpiBacklogShort: "Backlog",
  kpiBacklogHelp: "Conversas aguardando atendimento neste momento.",
  kpiNoData: "Sem dados no período",
  kpiTrendUp: "Aumentou",
  kpiTrendDown: "Reduziu",
  kpiTrendFlat: "Estável",
  kpiVsPrevious: "vs. período anterior",

  // Seller load
  sellerLoadTitle: "Carga por vendedor",
  sellerLoadSubtitle: "Conversas ativas — aguardando e em andamento",
  sellerLoadHelp:
    "Quantas conversas ativas (aguardando + em andamento) cada vendedor tem agora. Ajuda a identificar sobrecarga e equilibrar a distribuição da equipe.",
  sellerLoadEmpty: "Nenhum vendedor com carga ativa no momento.",
  sellerLoadCount: (n: number) => (n === 1 ? "1 conversa" : `${n} conversas`),
  sellerLoadAvailabilityOnline: "Online",
  sellerLoadAvailabilityAusente: "Ausente",
  sellerLoadAvailabilityOcupado: "Ocupado",
  sellerLoadAvailabilityOffline: "Offline",

  // Heatmap
  heatmapTitle: "Heatmap de volume",
  heatmapSubtitle: "Mensagens recebidas por dia da semana × hora",
  heatmapHelp:
    "Concentração de mensagens recebidas por dia da semana e hora. As células mais escuras mostram os horários de pico do atendimento.",
  heatmapEmpty: "Sem mensagens neste período.",
  heatmapLegendMin: "Menos",
  heatmapLegendMax: "Mais",
  heatmapTooltip: (day: string, hour: string, n: number) =>
    `${day} ${hour}h: ${n} mensagem${n === 1 ? "" : "s"}`,
  heatmapDays: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const,

  // Carteira health
  carteiraTitle: "Saúde da carteira",
  carteiraSubtitle: "Distribuição dos clientes por ciclo de vida",
  carteiraHelp:
    "Distribuição dos clientes da carteira por ciclo de vida (ativo, dormente, recuperação, perdido). Clique numa fatia para ver os clientes daquele grupo.",
  carteiraEmpty: "Sem clientes na loja ainda.",
  carteiraTotal: "Total de clientes",
  carteiraStatusAtivo: "Ativo",
  carteiraStatusDormente: "Dormente",
  carteiraStatusRecuperacao: "Recuperação",
  carteiraStatusPerdido: "Perdido",

  // Alerts
  alertsTitle: "Alertas ativos",
  alertsSubtitle: "Pontos que pedem atenção agora",
  alertsHelp:
    "Pontos que pedem atenção agora: clientes importantes dormentes, vendedores sobrecarregados e conversas sem resposta. Os limites são definidos em 'Configurar alertas'.",
  alertsEmpty: "Tudo certo no momento.",
  alertsView: "Ver",
  alertsDismiss: "Dispensar",
  alertsViewMore: (n: number) => `+${n} mais`,
  alertSeverityCritical: "Crítica",
  alertSeverityHigh: "Alta",
  alertSeverityMedium: "Média",
  alertClienteADormente: (name: string, days: number) =>
    `Cliente A dormente: ${name} — ${days} dia${days === 1 ? "" : "s"} sem compra`,
  alertVendedorSobrecarregado: (name: string, n: number, limit: number) =>
    `${name} está sobrecarregado — ${n} conversas ativas (limite ${limit})`,
  alertConversaSemResposta: (n: number, hours: number) =>
    `${n} conversa${n === 1 ? "" : "s"} sem resposta há mais de ${hours}h`,

  // Settings modal
  settingsTitle: "Configuração dos alertas",
  settingsDescription:
    "Defina os limites usados pelos alertas operacionais do painel. As mudanças entram em vigor imediatamente.",
  settingsConvHoursLabel: "Conversa sem resposta há mais de",
  settingsOverloadLabel: "Vendedor sobrecarregado a partir de",
  settingsConvHoursUnit: "horas",
  settingsOverloadUnit: "conversas",
  settingsEnableLabel: "Habilitar alerta",
  settingsPollingLabel: "Frequência de atualização",
  settingsPollingOption: (seconds: number) =>
    seconds < 60 ? `${seconds} segundos` : `${seconds / 60} minuto${seconds / 60 === 1 ? "" : "s"}`,
  settingsSave: "Salvar",
  settingsCancel: "Cancelar",
  settingsSaved: "Configurações salvas",
  settingsSaveError: "Não foi possível salvar as configurações.",

  // No access placeholder
  noAccessTitle: "Painel não disponível para o seu papel",
  noAccessDescription:
    "Vendedores acompanham o atendimento pela Central. Para ver métricas operacionais, peça acesso ao gestor da loja.",
  noAccessCta: "Ir para a Central de Atendimento",

  // Errors
  errorLoading: "Erro ao carregar este indicador.",
  errorRetry: "Tentar novamente",
} as const;
