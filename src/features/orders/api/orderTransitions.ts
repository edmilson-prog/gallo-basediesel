import type { ID, IOrder } from "@/shared/types";
import type { IOrdersProvider } from "@/providers/data/contracts/orders";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { computeOrderStatus } from "../utils/orderStatus";

/**
 * Set of high-level transitions allowed on an order (PRD-032 RF-015). Each
 * helper wraps `ordersProvider.update`, emits an audit log entry capturing the
 * status change, and respects MVP business rules.
 */

interface IBaseArgs {
  ordersProvider: IOrdersProvider;
  order: IOrder;
}

function nowISO(): string {
  return new Date().toISOString();
}

function logTransition(
  order: IOrder,
  before: IOrder,
  action: string,
  extra?: Record<string, unknown>,
) {
  const beforeStatus = computeOrderStatus(before);
  const afterStatus = computeOrderStatus(order);
  auditLog({
    action,
    resource: "order",
    resourceId: order.id,
    before: { status: beforeStatus },
    after: { status: afterStatus, ...extra },
    storeId: order.storeId,
  });
}

export async function markOrderPaid(args: IBaseArgs): Promise<IOrder> {
  const { ordersProvider, order } = args;
  const paidAt = nowISO();
  const updated = await ordersProvider.update(order.id, {
    paymentStatus: "pago",
    paidAt,
  });
  logTransition(updated, order, "order_payment_status_change", {
    paymentStatus: "pago",
    paidAt,
  });
  return updated;
}

export async function markOrderOverdue(args: IBaseArgs): Promise<IOrder> {
  const { ordersProvider, order } = args;
  const updated = await ordersProvider.update(order.id, { paymentStatus: "vencido" });
  logTransition(updated, order, "order_payment_status_change", { paymentStatus: "vencido" });
  return updated;
}

export async function refundOrder(args: IBaseArgs): Promise<IOrder> {
  const { ordersProvider, order } = args;
  const updated = await ordersProvider.update(order.id, { paymentStatus: "estornado" });
  logTransition(updated, order, "order_payment_refund", {
    note: "Refund placeholder — integração com gateway na Fase 2.",
  });
  return updated;
}

export async function startOrderFulfillment(args: IBaseArgs): Promise<IOrder> {
  const { ordersProvider, order } = args;
  const updated = await ordersProvider.update(order.id, {
    fulfillmentStatus: "separacao",
  });
  logTransition(updated, order, "order_fulfillment_status_change", {
    fulfillmentStatus: "separacao",
  });
  return updated;
}

export interface IShipOrderInput {
  carrier?: string;
  trackingCode?: string;
}

export async function shipOrder(args: IBaseArgs & { input: IShipOrderInput }): Promise<IOrder> {
  const { ordersProvider, order, input } = args;
  const shippedAt = nowISO();
  const updated = await ordersProvider.update(order.id, {
    fulfillmentStatus: "expedido",
    carrier: input.carrier?.trim() || undefined,
    trackingCode: input.trackingCode?.trim() || undefined,
    shippedAt,
  });
  logTransition(updated, order, "order_fulfillment_status_change", {
    fulfillmentStatus: "expedido",
    carrier: input.carrier,
    trackingCode: input.trackingCode,
    shippedAt,
  });
  return updated;
}

export async function deliverOrder(args: IBaseArgs): Promise<IOrder> {
  const { ordersProvider, order } = args;
  const deliveredAt = nowISO();
  const updated = await ordersProvider.update(order.id, {
    fulfillmentStatus: "entregue",
    deliveredAt,
  });
  logTransition(updated, order, "order_fulfillment_status_change", {
    fulfillmentStatus: "entregue",
    deliveredAt,
  });
  return updated;
}

export interface IReturnOrderInput {
  reason: string;
}

export async function returnOrder(args: IBaseArgs & { input: IReturnOrderInput }): Promise<IOrder> {
  const { ordersProvider, order, input } = args;
  if (!input.reason.trim()) throw new Error("Motivo é obrigatório para registrar devolução.");
  const returnedAt = nowISO();
  const updated = await ordersProvider.update(order.id, {
    fulfillmentStatus: "devolvido",
    paymentStatus: "estornado",
    returnedAt,
    returnReason: input.reason.trim(),
  });
  logTransition(updated, order, "order_return", {
    reason: input.reason.trim(),
    returnedAt,
  });
  return updated;
}

export interface ICancelOrderInput {
  reason: string;
  actorId?: ID;
}

export async function cancelOrder(args: IBaseArgs & { input: ICancelOrderInput }): Promise<IOrder> {
  const { ordersProvider, order, input } = args;
  if (!input.reason.trim()) throw new Error("Motivo é obrigatório para cancelar o pedido.");
  if (order.fulfillmentStatus === "expedido" || order.fulfillmentStatus === "entregue") {
    throw new Error("Pedido já enviado/entregue — use a opção Devolver em vez de cancelar.");
  }
  const canceledAt = nowISO();
  const updated = await ordersProvider.update(order.id, {
    canceledAt,
    canceledBy: input.actorId,
    cancelReason: input.reason.trim(),
    fulfillmentStatus: "cancelado",
  });
  logTransition(updated, order, "order_cancel", {
    reason: input.reason.trim(),
    canceledAt,
  });
  return updated;
}

export async function generateInvoicePlaceholder(args: IBaseArgs): Promise<IOrder> {
  const { ordersProvider, order } = args;
  const issuedAt = nowISO();
  const invoiceNumber = `NF-${Date.now()}`;
  const updated = await ordersProvider.update(order.id, {
    nfNumber: invoiceNumber,
    nfDate: issuedAt,
  });
  auditLog({
    action: "order_invoice_generate",
    resource: "order",
    resourceId: order.id,
    after: { invoiceNumber, issuedAt },
    storeId: order.storeId,
  });
  return updated;
}

export async function updateOrderDeliveryAddress(
  args: IBaseArgs & { address: NonNullable<IOrder["deliveryAddress"]> },
): Promise<IOrder> {
  const { ordersProvider, order, address } = args;
  const updated = await ordersProvider.update(order.id, { deliveryAddress: address });
  auditLog({
    action: "order_address_update",
    resource: "order",
    resourceId: order.id,
    before: order.deliveryAddress,
    after: address,
    storeId: order.storeId,
  });
  return updated;
}
