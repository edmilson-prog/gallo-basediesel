import type { IOrder, OrderStatus } from "@/shared/types";

/**
 * Aggregate the canonical {@link OrderStatus} from the order's payment +
 * fulfillment + cancellation state (PRD-032 RF-004). Pure function — never
 * persisted; the UI derives it on every render.
 */
export function computeOrderStatus(order: IOrder): OrderStatus {
  if (order.canceledAt || order.fulfillmentStatus === "cancelado") return "cancelado";
  if (order.fulfillmentStatus === "devolvido" || order.paymentStatus === "estornado") {
    return "devolvido";
  }
  if (order.fulfillmentStatus === "entregue") {
    return order.paymentStatus === "pago" ? "concluido" : "entregue";
  }
  if (order.fulfillmentStatus === "expedido") return "enviado";
  if (order.fulfillmentStatus === "separacao") return "em_separacao";
  if (order.paymentStatus === "pago" || order.paymentStatus === "parcial") {
    return "pago_aguardando_envio";
  }
  return "aguardando_pagamento";
}

/** UI-facing label for an order status. */
export function orderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case "aguardando_pagamento":
      return "Aguardando pagamento";
    case "pago_aguardando_envio":
      return "Pago — aguardando envio";
    case "em_separacao":
      return "Em separação";
    case "enviado":
      return "Enviado";
    case "entregue":
      return "Entregue";
    case "concluido":
      return "Concluído";
    case "cancelado":
      return "Cancelado";
    case "devolvido":
      return "Devolvido";
  }
}

/** Whether the order is still mutable (items, address, payment). */
export function isOrderEditable(order: IOrder): boolean {
  if (order.canceledAt) return false;
  if (order.fulfillmentStatus === "devolvido" || order.fulfillmentStatus === "entregue") {
    return false;
  }
  return order.paymentStatus !== "pago" || order.fulfillmentStatus === "pendente";
}

/** Whether `cancelOrder()` is allowed for this order. */
export function canCancelOrder(order: IOrder): boolean {
  if (order.canceledAt) return false;
  return (
    order.fulfillmentStatus === "pendente" ||
    order.fulfillmentStatus === "separacao"
  );
}

/** Helper to flag overdue pending payments (used for badge / filter). */
export function isPaymentOverdue(order: IOrder, now: Date = new Date()): boolean {
  if (order.paymentStatus !== "pendente") return false;
  if (!order.paymentTerms) return false;
  // MVP heuristic: 30 days from creation when terms include "prazo" / a number.
  const days = parseDaysFromTerms(order.paymentTerms);
  if (!days) return false;
  const due = new Date(order.createdAt);
  due.setUTCDate(due.getUTCDate() + days);
  return now.getTime() > due.getTime();
}

function parseDaysFromTerms(terms: string): number | null {
  const match = terms.match(/(\d+)/);
  if (!match) return null;
  return Number.parseInt(match[1] ?? "", 10) || null;
}
