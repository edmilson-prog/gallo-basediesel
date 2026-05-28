/** User-facing strings for the B2B corporate portal (PRD-071). */
export const PORTAL_STRINGS = {
  brand: "GALLO B2B",
  phase2Banner: "Módulo em demonstração — recursos completos disponíveis na Fase 2.",

  // Login
  loginTitle: "Portal Corporativo",
  loginSubtitle: "Acesso exclusivo para clientes B2B GALLO BASE DIESEL.",
  loginEmail: "E-mail corporativo",
  loginPassword: "Senha",
  loginCta: "Entrar",
  loginError: "Não foi possível entrar. Verifique suas credenciais.",
  loginHint: "Dica (demo): deixe em branco para entrar como administrador da primeira empresa.",

  // Dashboard
  kpiOrdersOpen: "Pedidos em andamento",
  kpiSpendMonth: "Gastos do mês",
  kpiFleet: "Veículos na frota",
  kpiRequestsPending: "Solicitações pendentes",
  kpiCredit: "Crédito disponível",
  shortcutNewRequest: "Nova solicitação",
  shortcutAddVehicle: "Adicionar veículo",
  shortcutSupport: "Falar com consultor",

  // Fleet
  fleetTitle: "Gestão de frota",
  fleetSearch: "Buscar por placa, modelo…",
  fleetEmpty: "Nenhum veículo cadastrado.",
  fleetFilterAll: "Todos",
  fleetRequestParts: "Solicitar peças para este veículo",
  fleetNextMaintenance: "Próxima manutenção sugerida",
  tabGeneral: "Geral",
  tabMaintenance: "Manutenção",
  tabDocs: "Documentação",
  tabDrivers: "Quem dirige",

  // Requests
  requestsTitle: "Solicitações de orçamento",
  requestsNew: "Nova solicitação",
  requestsEmpty: "Nenhuma solicitação encontrada.",
  requestNoPermission: "Você não tem permissão para criar solicitações.",
  reqStepItems: "Itens",
  reqStepUrgency: "Urgência",
  reqStepNotes: "Observações",
  reqStepReview: "Revisão",
  reqItemPlaceholder: "Descreva a peça desejada",
  reqAddItem: "Adicionar item",
  reqUrgencyNormal: "Padrão",
  reqUrgencyUrgent: "Urgente",
  reqUrgencyScheduled: "Programada",
  reqScheduledFor: "Data desejada",
  reqNotes: "Observações adicionais",
  reqSubmit: "Enviar solicitação",
  reqCreated: "Solicitação enviada com sucesso.",
  reqApprove: "Aprovar",
  reqAboveLimit: "Acima do seu limite de aprovação",
  reqApproved: "Solicitação aprovada.",

  // Orders
  ordersTitle: "Pedidos",
  ordersEmpty: "Nenhum pedido encontrado.",
  orderApprovalInfo: "Aprovação interna",
  orderRepeat: "Repetir pedido",

  // Billing
  billingTitle: "Faturamento corporativo",
  billingLimit: "Limite de crédito",
  billingUsed: "Utilizado",
  billingAvailable: "Disponível",
  billingInstallments: "Parcelas em aberto",
  billingInvoices: "Notas fiscais",

  // Analytics
  analyticsTitle: "Análise de gastos",
  chartSpendMonthly: "Gastos por mês",
  chartSpendCategory: "Gastos por categoria",
  chartTopParts: "Top 10 peças compradas",
  chartByVehicle: "Gastos por veículo",

  // Users
  usersTitle: "Usuários da empresa",
  usersNew: "Convidar usuário",
  usersNewPlaceholder: "Convite por e-mail disponível na Fase 2.",
  userRoleAdmin: "Administrador",
  userRoleBuyer: "Comprador",
  userRoleViewer: "Visualizador",
  userApprovalLimit: "Limite de aprovação",
  userActive: "Ativo",
  userSave: "Salvar",
  userRemove: "Remover",

  // Profile
  profileTitle: "Perfil da empresa",
  profileSave: "Salvar alterações",
  profileSaved: "Dados atualizados.",

  // Support
  supportTitle: "Suporte priorizado",
  supportWhatsApp: "Falar via WhatsApp",
  supportPhone: "Consultor dedicado",
  supportFaq: "Perguntas frequentes",
  supportTickets: "Meus chamados",

  // Common
  logout: "Sair",
  back: "Voltar",
  noAccessTitle: "Sem acesso",
  noAccessDescription: "Você não tem permissão para acessar este módulo.",
} as const;

export const PORTAL_ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  comprador: "Comprador",
  visualizador: "Visualizador",
};

export const PORTAL_REQUEST_STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta",
  em_orcamento: "Em orçamento",
  orcada: "Orçada",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  convertida: "Convertida",
  cancelada: "Cancelada",
};
