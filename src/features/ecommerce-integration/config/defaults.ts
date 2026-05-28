import type { IEcommerceIntegrationSettings } from "@/shared/types";

/**
 * Seed configuration for the e-commerce ↔ central integration (PRD-067).
 * Round-robin by default; placeholder notification templates use the
 * {variable} convention rendered by `renderTemplate`.
 */
export const DEFAULT_ECOMMERCE_INTEGRATION_SETTINGS: IEcommerceIntegrationSettings = {
  assignmentMode: "round_robin",
  createConversationAuto: true,
  notifyCustomer: true,
  templates: {
    whatsappConfirmation:
      "Olá {customerName}! Seu pedido {orderNumber} foi recebido.\nValor: {total}\nForma de pagamento: {paymentMethod}\nEm breve enviaremos as instruções de pagamento.\n\nGALLO BASE DIESEL",
    emailConfirmation:
      "Olá {customerName},\n\nRecebemos o seu pedido {orderNumber} no valor de {total}. Nossa equipe entrará em contato em breve.\n\nObrigado por comprar com a GALLO BASE DIESEL.",
    statusPaid: "Pagamento do pedido {orderNumber} confirmado. Já estamos preparando o envio!",
    statusShipped: "Seu pedido {orderNumber} foi enviado. Acompanhe a entrega com a transportadora.",
    statusDelivered: "Seu pedido {orderNumber} foi entregue. Obrigado pela preferência!",
    statusCanceled: "Seu pedido {orderNumber} foi cancelado. Motivo: {reason}",
  },
};
