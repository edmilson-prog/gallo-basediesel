/** User-facing strings for the external-seller PWA (PRD-070). */
export const PWA_STRINGS = {
  appName: "GALLO Vendedor",
  phase2Banner: "PWA em desenvolvimento — funcionalidades completas na Fase 2.",
  offlineBanner: "Modo offline disponível na Fase 2.",

  navHome: "Início",
  navPortfolio: "Carteira",
  navQuote: "Orçamento",
  navAgenda: "Agenda",
  navProfile: "Eu",

  // Login
  loginTitle: "Acesso do vendedor",
  loginSubtitle: "Entre para acessar sua carteira em campo.",
  loginEmail: "E-mail",
  loginPassword: "Senha",
  loginCta: "Entrar",
  loginError: "Não foi possível entrar. Verifique o e-mail.",

  // Home
  homeGreeting: (name: string) => `Olá, ${name.split(" ")[0]}`,
  kpiVisitsToday: "Visitas hoje",
  kpiQuotesSent: "Orçamentos enviados",
  kpiPipeline: "Pipeline",
  upcomingVisits: "Próximas visitas",
  pendingQuotes: "Orçamentos recentes",
  shortcutNewQuote: "Novo orçamento",
  shortcutNewVisit: "Agendar visita",
  emptyVisits: "Nenhuma visita agendada.",
  emptyQuotes: "Nenhum orçamento recente.",

  // Portfolio
  portfolioTitle: "Minha carteira",
  portfolioSearch: "Buscar cliente…",
  portfolioEmpty: "Nenhum cliente encontrado.",
  lastPurchase: "Última compra",
  noPurchase: "Sem compras",

  // Customer detail
  detailBack: "Voltar à carteira",
  tabOrders: "Pedidos",
  tabQuotes: "Orçamentos",
  tabVehicles: "Veículos",
  tabConversations: "Conversas",
  detailNewQuote: "Novo orçamento",
  detailScheduleVisit: "Agendar visita",

  // Quick quote
  quoteTitle: "Novo orçamento rápido",
  quoteStepCustomer: "Cliente",
  quoteStepItems: "Itens",
  quoteStepReview: "Revisar",
  quoteSelectCustomer: "Selecione o cliente",
  quoteSearchParts: "Buscar peça…",
  quoteAddItem: "Adicionar",
  quoteEmptyItems: "Nenhum item adicionado.",
  quoteSubtotal: "Subtotal",
  quoteConfirm: "Criar orçamento",
  quoteCreated: "Orçamento criado com sucesso.",
  quoteCreateFailed: "Falha ao criar orçamento.",
  quoteNext: "Continuar",
  quoteBack: "Voltar",

  // Agenda
  agendaTitle: "Agenda de visitas",
  agendaNew: "Nova visita",
  agendaEmpty: "Nenhuma visita nesta semana.",
  agendaThisWeek: "Esta semana",
  agendaUpcoming: "Próximas",

  // New visit
  visitTitle: "Agendar visita",
  visitCustomer: "Cliente",
  visitDate: "Data e hora",
  visitAddress: "Endereço",
  visitNotes: "Observações",
  visitConfirm: "Agendar",
  visitCreated: "Visita agendada.",
  visitSelectCustomer: "Selecione o cliente",

  // Profile
  profileTitle: "Meu perfil",
  profileLogout: "Sair",
  profileStore: "Loja",
} as const;

export const VISIT_STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  remarcada: "Remarcada",
};
