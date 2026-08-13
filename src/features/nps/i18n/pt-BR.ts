export const S = {
  pageTitle: "Net Promoter Score",
  pageSubtitle: "Net Promoter Score das conversas resolvidas",

  // Filtros
  windowLabel: "Janela",
  window30: "30 dias",
  window90: "90 dias",
  window180: "180 dias",
  window365: "365 dias",
  audienceLabel: "Público",
  audienceAll: "Todos",
  audienceCustomer: "Clientes cadastrados",
  audienceContact: "Contatos",
  /** "128 respostas de 214 pesquisas enviadas" */
  responsesOfSent: (n: number, sent: number) =>
    `${n} ${n === 1 ? "resposta" : "respostas"} de ${sent} ${sent === 1 ? "pesquisa enviada" : "pesquisas enviadas"}`,

  // KPIs
  kpiScore: "NPS",
  kpiResponses: "Respostas",
  kpiResponseRate: "Taxa de resposta",
  kpiPromoters: "Promotores",
  kpiDetractors: "Detratores",
  kpiDelta: "vs. janela anterior",
  promotersSub: (n: number) => `${n} ${n === 1 ? "cliente deu" : "clientes deram"} 9 ou 10`,
  detractorsSub: (n: number) => `${n} ${n === 1 ? "nota" : "notas"} de 0 a 6 no período`,
  responseRateSub: (pct: number, sent: number) => `${pct}% de ${sent} enviadas`,
  collecting: (n: number, min: number) => `Coletando dados (${n}/${min})`,
  collectingShort: "Coletando",
  collectingHelp:
    "O score só aparece a partir do mínimo de respostas — abaixo disso, o número enganaria mais do que informaria.",

  // Classes
  promoters: "Promotores",
  passives: "Neutros",
  detractors: "Detratores",

  // Blocos do painel
  distributionTitle: "Distribuição",
  trendTitle: "Tendência",
  trendSub: "NPS mensal · 12 meses",
  byStoreTitle: "Por loja",
  bySellerTitle: "Por atendente",
  bySellerEmpty: "Ainda não há respostas atribuídas a atendentes nesta janela.",

  reasonsTitle: "Motivos citados",
  reasonsSub: "chips marcados na pesquisa",
  reasonsUp: "O que puxa pra cima",
  reasonsDown: "O que puxa pra baixo",
  reasonsEmpty: "Sem motivos marcados nesta janela.",

  // Tabela
  tableTitle: "Respostas",
  colDate: "Data",
  colName: "Contato",
  colScore: "Nota",
  colComment: "Comentário",
  colAudience: "Tipo",
  colSeller: "Atendente",
  colResponses: "Resp.",
  searchPlaceholder: "Buscar no comentário…",
  noComment: "—",
  typeCustomer: "Cliente",
  typeContact: "Contato",

  // Detratores
  detractorsTitle: "Detratores da janela",
  detractorsEmpty: "Nenhum detrator nesta janela.",
  openConversation: "Abrir conversa",

  // Estados
  loading: "Carregando…",
  empty: "Nenhuma resposta nesta janela.",
  errorTitle: "Não foi possível carregar o NPS",
} as const;
