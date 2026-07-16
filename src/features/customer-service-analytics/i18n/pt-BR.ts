/** Brazilian Portuguese strings for the Customer Service Analytics feature (PRD-051). */
export const CSA_STRINGS = {
  pageTitle: "Atendimento — Análise Histórica",
  pageSubtitle:
    "Evolução das métricas de atendimento: volume, TMA, TMR, taxa de resolução, conversão pós-atendimento e motivos de escalação do SDR.",

  filtersAnchor: "Mês de referência",
  filtersSeller: "Vendedor",
  filtersSellerAll: "Todos os vendedores",

  tabOverview: "Visão Geral",
  tabChannel: "Por Canal",
  tabSeller: "Por Vendedor",
  tabEscalations: "Escalações SDR",

  kpiVolume: "Conversas totais",
  kpiTma: "TMA médio",
  kpiTmaHelp: "Tempo médio de atendimento (criação → última mensagem) em resolvidas.",
  kpiTmr: "TMR médio",
  kpiTmrHelp: "Tempo até primeira resposta humana.",
  kpiResolution: "Taxa de resolução",
  kpiResolutionHelp: "Resolvidas sem escalação.",
  kpiConversion: "Conversão",
  kpiConversionHelp: "Conversas que viraram pedido pago.",
  kpiNpsPlaceholder: "NPS (em breve)",
  kpiNpsPlaceholderHelp: "Disponível na Fase 2 quando integrarmos pesquisas com clientes.",

  chartTrendTitle: "Evolução de TMA e TMR (12 meses)",
  chartTrendHelp: "Linhas mostram média mensal — TMA em laranja, TMR em verde.",
  chartTrendEmpty: "Sem dados suficientes para o período.",

  chartVolumeTitle: "Volume diário de conversas",
  chartVolumeHelp: "Número de conversas iniciadas por dia no período.",

  comparativeTitle: "Comparativo vs período anterior",
  comparativeDelta: "Variação",
  comparativeNoBaseline: "Sem base",

  // Aba canal
  chartChannelTitle: "Volume por canal",
  chartChannelHelp: "Distribuição absoluta de conversas por meio de atendimento.",
  channelEmpty: "Nenhuma conversa no período.",
  tableChannel: "Canal",
  tableVolume: "Volume",

  // Aba vendedor
  tableSellerHeader: "Vendedor",
  tableHealth: "Saúde",
  sellerEmpty: "Nenhum vendedor com conversas atribuídas no período.",
  sellerBelowAverage: "Abaixo da média",

  // Drill-down vendedor
  drillTitle: "Atendimento — ",
  drillBack: "Voltar à análise",
  drillTeamAverage: "Média da equipe",

  // Escalações
  escAvgTitle: "Total de escalações",
  escByReasonTitle: "Distribuição por motivo",
  escByReasonEmpty: "Nenhuma escalação registrada no período.",
  escTopSellersTitle: "Vendedores que mais recebem escalações",
  reasonCustomerRequested: "Cliente solicitou humano",
  reasonNegotiationDetected: "Negociação detectada",
  reasonSdrFailed: "SDR falhou",
  reasonComplexity: "Complexidade",
  reasonOutOfScope: "Fora do escopo",
  reasonQualifiedHandoff: "Triagem concluída",

  blockedTitle: "Acesso restrito",
  blockedDescription:
    "A análise de atendimento é estratégica e visível apenas para Owner, Gestor e Financeiro.",
} as const;
