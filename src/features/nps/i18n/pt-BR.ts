export const S = {
  pageTitle: "NPS — Satisfação",
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

  // KPIs
  kpiScore: "NPS",
  kpiResponses: "Respostas",
  kpiResponseRate: "Taxa de resposta",
  kpiDelta: "vs. janela anterior",
  collecting: (n: number, min: number) => `Coletando dados (${n}/${min})`,
  collectingHelp:
    "O score só aparece a partir do mínimo de respostas — abaixo disso, o número enganaria mais do que informaria.",

  // Classes
  promoters: "Promotores",
  passives: "Neutros",
  detractors: "Detratores",

  // Gráficos
  trendTitle: "Evolução mensal",
  distributionTitle: "Distribuição por mês",

  // Tabela
  tableTitle: "Respostas",
  colDate: "Data",
  colName: "Contato",
  colScore: "Nota",
  colComment: "Comentário",
  colAudience: "Tipo",
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
