import type {
  ID,
  IOrder,
  IOrderItem,
  IQuote,
  OrderOrigin,
  OrderPaymentMethod,
} from "@/shared/types";
import type { IOrdersProvider } from "@/providers/data/contracts/orders";
import type { IQuotesProvider } from "@/providers/data/contracts/quotes";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { computeCommissionPreview } from "../utils/commissionPreview";
import { composeOrderPaymentCondition, generateOrderNumber } from "../utils/orderNumber";

/** Extra fields collected on the conversion modal (PRD-031 → PRD-032). */
export interface IConvertToOrderExtras {
  /** Final payment method confirmed during the conversion. */
  paymentMethod?: OrderPaymentMethod;
  /** Free-form payment terms ("à vista", "30/60/90"). */
  paymentTerms?: string;
  /** Origin override — defaults to `manual` (or `whatsapp` when conversationId exists). */
  origin?: OrderOrigin;
  /** Optional override of the delivery address (defaults to quote.deliveryAddress). */
  deliveryAddress?: IQuote["deliveryAddress"];
  /** Internal notes carried over from the quote (defaults to quote.notes). */
  internalNotes?: string;
  /** Customer-facing notes printed on the order. */
  customerNotes?: string;
  /** Conversation that originated the order (SDR flow). */
  conversationId?: ID;
}

export interface ICreateOrderFromQuoteOptions {
  ordersProvider: IOrdersProvider;
  quotesProvider: IQuotesProvider;
  extras?: IConvertToOrderExtras;
  /** Override the actor recorded by the audit log (e.g. SDR agent id). */
  actorId?: ID;
}

/**
 * Convert an accepted quote into a real order (PRD-032 RF-019).
 *
 * - Copies items as snapshots (price/SKU/name + cost/margin).
 * - Sets paymentStatus = `pendente`, fulfillmentStatus = `pendente`.
 * - Computes the commission preview snapshot.
 * - Flips the quote to `convertido` and points `convertedToOrderId` at the new order.
 * - Emits audit logs on both the order (`order_create`) and the quote (`quote_convert_to_order`).
 *
 * Replaces the inline stub previously living in `QuoteDetailPage.handleConvertToOrder`
 * and `useSdrResponder` (PRD-022 acceptance flow).
 */
export async function createOrderFromQuote(
  quoteId: ID,
  opts: ICreateOrderFromQuoteOptions,
): Promise<IOrder> {
  const { ordersProvider, quotesProvider, extras = {} } = opts;
  const quote = await quotesProvider.get(quoteId);
  if (!quote.customerId) {
    throw new Error(
      `[createOrderFromQuote] Quote ${quote.id} has no customerId — convert the lead to a customer first.`,
    );
  }

  const orderItems: IOrderItem[] = quote.items.map((it) => {
    const unitCost = round(it.unitPrice * 0.7);
    const marginValue = round((it.unitPrice - unitCost) * it.quantity - it.discount);
    return {
      // Plain uuid: `order_items.id` is a uuid column.
      id: crypto.randomUUID(),
      partId: it.partId,
      partSku: it.partSku,
      partName: it.partName,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      unitCost,
      discount: it.discount,
      total: it.total,
      marginValue,
    };
  });

  const paymentMethod = extras.paymentMethod ?? quote.paymentMethod;
  const paymentTerms = extras.paymentTerms ?? quote.paymentTerms ?? quote.paymentCondition;
  const paymentCondition = composeOrderPaymentCondition(paymentMethod, paymentTerms);
  const origin: OrderOrigin =
    extras.origin ?? (extras.conversationId || quote.conversationId ? "whatsapp" : "manual");

  // Generate sequential number scoped to the store + current year.
  const existing = await ordersProvider.list({ storeId: quote.storeId, pageSize: 1000 });
  const number = generateOrderNumber(existing.data, quote.storeId);

  const commissionPreview = computeCommissionPreview(
    { subtotal: quote.subtotal, discount: quote.discount },
    { storeId: quote.storeId },
  );

  const created = await ordersProvider.create({
    storeId: quote.storeId,
    customerId: quote.customerId,
    sellerId: quote.sellerId,
    number,
    quoteId: quote.id,
    conversationId: extras.conversationId ?? quote.conversationId,
    items: orderItems,
    subtotal: quote.subtotal,
    discount: quote.discount,
    shipping: quote.shipping,
    total: quote.total,
    paymentCondition,
    paymentMethod,
    paymentTerms,
    paymentStatus: "pendente",
    fulfillmentStatus: "pendente",
    deliveryAddress: extras.deliveryAddress ?? quote.deliveryAddress,
    // Carry over the shipping-quote snapshot (Melhor Envio Fase A → reused by Fase B).
    ...(quote.shippingQuote ? { shippingQuote: quote.shippingQuote } : {}),
    origin,
    division: quote.division,
    internalNotes: extras.internalNotes ?? quote.notes,
    customerNotes: extras.customerNotes,
    commissionPreview,
    notes: extras.internalNotes ?? quote.notes,
  });

  const now = new Date().toISOString();
  await quotesProvider.update(quote.id, {
    status: "convertido",
    convertedToOrderId: created.id,
    convertedAt: now,
  });

  auditLog({
    actorId: opts.actorId,
    action: "order_create",
    resource: "order",
    resourceId: created.id,
    after: { quoteId: quote.id, number: created.number, total: created.total, origin },
    storeId: created.storeId,
  });
  auditLog({
    actorId: opts.actorId,
    action: "quote_convert_to_order",
    resource: "quote",
    resourceId: quote.id,
    after: { orderId: created.id, number: created.number },
    storeId: quote.storeId,
  });

  return created;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
