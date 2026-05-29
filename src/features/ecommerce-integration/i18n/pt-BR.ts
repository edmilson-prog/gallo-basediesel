/** User-facing strings for the e-commerce ↔ central integration (PRD-067). */
export const ECOMMERCE_INTEGRATION_STRINGS = {
  pageTitle: "Integração E-commerce",
  pageDescription:
    "Como pedidos da vitrine pública chegam à Central — atribuição, conversa automática e notificações.",
  phase2Banner:
    "Notificações reais (WhatsApp / e-mail) chegam na Fase 2. No MVP, os disparos são registrados em auditoria sem envio real.",

  assignmentTitle: "Modo de atribuição",
  modeRoundRobin: "Rodízio automático (round-robin)",
  modeRoundRobinHint:
    "Distribui entre vendedores ativos priorizando quem tem menos pedidos e-com abertos.",
  modeManager: "Gestor distribui manualmente",
  modeManagerHint: "A conversa fica sem vendedor até um gestor distribuir.",
  modeSpecific: "Vendedor específico",
  modeSpecificHint: "Todos os pedidos via e-commerce vão para um único vendedor.",
  specificSellerLabel: "Vendedor responsável",
  specificSellerPlaceholder: "Selecione o vendedor",

  behaviorTitle: "Comportamento",
  createConversationLabel: "Criar conversa automática",
  createConversationHint: "Abre uma conversa vinculada ao pedido na inbox do vendedor.",
  notifyCustomerLabel: "Notificar cliente",
  notifyCustomerHint: "Registra notificação de confirmação ao cliente (placeholder no MVP).",

  templatesTitle: "Templates de notificação",
  templatesHint: "Variáveis: {customerName}, {orderNumber}, {total}, {paymentMethod}, {reason}.",
  tplWhatsapp: "Confirmação — WhatsApp",
  tplEmail: "Confirmação — E-mail",
  tplPaid: "Status — Pagamento confirmado",
  tplShipped: "Status — Enviado",
  tplDelivered: "Status — Entregue",
  tplCanceled: "Status — Cancelado",

  saved: "Configuração salva.",
  saveFailed: "Falha ao salvar a configuração.",
} as const;
