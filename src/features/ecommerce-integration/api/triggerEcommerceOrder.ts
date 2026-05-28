import type {
  ICustomer,
  ID,
  IEcommerceIntegrationSettings,
  IOrder,
  ISeller,
} from "@/shared/types";
import type { IOrdersProvider } from "@/providers/data/contracts/orders";
import type { ISellersProvider } from "@/providers/data/contracts/sellers";
import type { ICustomersProvider } from "@/providers/data/contracts/customers";
import type { IConversationsProvider } from "@/providers/data/contracts/conversations";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { getCustomerName } from "@/features/customers/utils/customerDisplay";
import { formatBRL } from "@/shared/utils/format";
import { useEcommerceNotificationStore } from "../store/ecommerceNotificationStore";
import { orderTemplateVars, renderTemplate } from "../utils/renderTemplate";

export interface ITriggerEcommerceOrderOptions {
  ordersProvider: IOrdersProvider;
  sellersProvider: ISellersProvider;
  customersProvider: ICustomersProvider;
  conversationsProvider: IConversationsProvider;
  settings: IEcommerceIntegrationSettings;
}

export interface ITriggerEcommerceOrderResult {
  order: IOrder;
  conversationId?: ID;
  /** Seller the order ended up assigned to (null when pending manager distribution). */
  assignedSellerId: ID | null;
}

/**
 * Orchestrates everything that must happen *after* an e-commerce order is
 * created (PRD-067 RF-001/003). This is the glue between /loja and /app:
 * resolves seller assignment by the configured mode, opens a linked
 * conversation, raises a seller notification and renders the placeholder
 * customer confirmation — every step audited.
 */
export async function triggerEcommerceOrder(
  order: IOrder,
  opts: ITriggerEcommerceOrderOptions,
): Promise<ITriggerEcommerceOrderResult> {
  const { ordersProvider, sellersProvider, customersProvider, conversationsProvider, settings } =
    opts;

  const sellers = await sellersProvider.list({ storeId: order.storeId, active: true });
  const assignment = await resolveAssignment(order, settings, sellers, ordersProvider);

  let workingOrder = order;
  // Persist a re-assignment only when the mode dictates a concrete seller
  // different from the one createOrderFromCart picked.
  if (assignment.sellerId && assignment.sellerId !== order.sellerId) {
    workingOrder = await ordersProvider.update(order.id, { sellerId: assignment.sellerId });
    auditLog({
      action: "ecommerce_seller_assign",
      resource: "order",
      resourceId: order.id,
      after: { sellerId: assignment.sellerId, mode: settings.assignmentMode },
      storeId: order.storeId,
    });
  } else {
    auditLog({
      action: "ecommerce_seller_assign",
      resource: "order",
      resourceId: order.id,
      after: {
        sellerId: assignment.unassigned ? null : order.sellerId,
        mode: settings.assignmentMode,
      },
      storeId: order.storeId,
    });
  }

  const customer = await customersProvider.get(workingOrder.customerId).catch(() => null);
  const customerName = customer ? getCustomerName(customer) : "Cliente";

  // Conversation linked to the order.
  let conversationId: ID | undefined;
  if (settings.createConversationAuto) {
    conversationId = await createLinkedConversation(
      workingOrder,
      assignment.unassigned ? null : workingOrder.sellerId,
      customerName,
      conversationsProvider,
    );
  }

  // Seller notification (or pending-distribution for managers).
  useEcommerceNotificationStore.getState().push({
    sellerId: assignment.unassigned ? null : workingOrder.sellerId,
    orderId: workingOrder.id,
    conversationId,
    orderNumber: workingOrder.number ?? workingOrder.id,
    customerName,
    total: workingOrder.total,
    kind: assignment.unassigned ? "pending_distribution" : "new_order",
  });

  // Placeholder customer notification (no real send on MVP).
  if (settings.notifyCustomer) {
    notifyCustomerConfirmation(workingOrder, customer, customerName, settings);
  }

  return {
    order: workingOrder,
    conversationId,
    assignedSellerId: assignment.unassigned ? null : workingOrder.sellerId,
  };
}

interface IAssignmentDecision {
  /** Concrete seller to assign, or null when unassigned (manager mode). */
  sellerId: ID | null;
  unassigned: boolean;
}

async function resolveAssignment(
  order: IOrder,
  settings: IEcommerceIntegrationSettings,
  sellers: ISeller[],
  ordersProvider: IOrdersProvider,
): Promise<IAssignmentDecision> {
  if (sellers.length === 0) return { sellerId: order.sellerId, unassigned: false };

  if (settings.assignmentMode === "manager_distributes") {
    return { sellerId: null, unassigned: true };
  }

  if (settings.assignmentMode === "specific_seller" && settings.specificSellerId) {
    const exists = sellers.some((s) => s.id === settings.specificSellerId);
    if (exists) return { sellerId: settings.specificSellerId, unassigned: false };
  }

  // round_robin (and specific_seller fallback): smallest open e-com load first.
  const all = await ordersProvider.list({ storeId: order.storeId, pageSize: 500 });
  const load = new Map<ID, number>();
  for (const o of all.data) {
    if (o.origin !== "ecommerce") continue;
    const open = o.fulfillmentStatus !== "entregue" && o.fulfillmentStatus !== "cancelado";
    if (!open) continue;
    load.set(o.sellerId, (load.get(o.sellerId) ?? 0) + 1);
  }
  const ranked = [...sellers].sort((a, b) => {
    const la = load.get(a.id) ?? 0;
    const lb = load.get(b.id) ?? 0;
    if (la !== lb) return la - lb;
    return a.id.localeCompare(b.id);
  });
  return { sellerId: ranked[0]!.id, unassigned: false };
}

async function createLinkedConversation(
  order: IOrder,
  sellerId: ID | null,
  customerName: string,
  conversationsProvider: IConversationsProvider,
): Promise<ID | undefined> {
  try {
    const created = await conversationsProvider.create({
      storeId: order.storeId,
      channel: "ecommerce",
      customerId: order.customerId,
      firstMessageText: `Novo pedido via e-commerce — ${order.items.length} itens — ${formatBRL(order.total)}`,
    });
    const conv = created.conversation;
    const tags = Array.from(new Set([...conv.tags, "ecommerce"]));
    if (!sellerId) tags.push("pendente-distribuicao");
    await conversationsProvider.update(conv.id, {
      assignedSellerId: sellerId ?? undefined,
      linkedOrderId: order.id,
      tags,
    });
    auditLog({
      action: "ecommerce_conversation_create",
      resource: "conversation",
      resourceId: conv.id,
      after: { orderId: order.id, customerName, sellerId },
      storeId: order.storeId,
    });
    return conv.id;
  } catch (err) {
    console.error("[triggerEcommerceOrder] conversation creation failed", err);
    return undefined;
  }
}

function notifyCustomerConfirmation(
  order: IOrder,
  customer: ICustomer | null,
  customerName: string,
  settings: IEcommerceIntegrationSettings,
): void {
  const vars = orderTemplateVars(order, customerName);
  const whatsapp = renderTemplate(settings.templates.whatsappConfirmation, vars);
  const email = renderTemplate(settings.templates.emailConfirmation, vars);
  auditLog({
    actorId: customer?.id,
    action: "ecommerce_notification_sent",
    resource: "order",
    resourceId: order.id,
    after: { channel: "whatsapp+email", placeholder: true, whatsapp, email },
    storeId: order.storeId,
  });
}

/**
 * Placeholder customer notification for an order status change (PRD-067 RF-014).
 * Renders the matching template and audits — no real dispatch on the MVP.
 */
export function notifyCustomerOfStatusChange(
  order: IOrder,
  status: "paid" | "shipped" | "delivered" | "canceled",
  settings: IEcommerceIntegrationSettings,
  customerName = "Cliente",
  reason?: string,
): void {
  const templateMap = {
    paid: settings.templates.statusPaid,
    shipped: settings.templates.statusShipped,
    delivered: settings.templates.statusDelivered,
    canceled: settings.templates.statusCanceled,
  } as const;
  const message = renderTemplate(templateMap[status], { ...orderTemplateVars(order, customerName), reason });
  auditLog({
    action: "ecommerce_notification_sent",
    resource: "order",
    resourceId: order.id,
    after: { channel: "status_change", status, placeholder: true, message },
    storeId: order.storeId,
  });
}
