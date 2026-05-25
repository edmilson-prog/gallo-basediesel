import type { ICustomer, IOrder, IOrderItem, IPart, IQuote, ID } from "@/shared/types";
import { SEED_STORE_ID } from "../data";
import { daysAgo, pickWeighted, randomDate, randomISO, type ISeededContext } from "./utils";

const PAYMENT_STATUS_WEIGHTS = [
  { value: "pago" as const, weight: 6 },
  { value: "pendente" as const, weight: 2 },
  { value: "parcial" as const, weight: 1 },
  { value: "estornado" as const, weight: 1 },
];

const FULFILLMENT_STATUS_WEIGHTS = [
  { value: "entregue" as const, weight: 6 },
  { value: "expedido" as const, weight: 2 },
  { value: "separacao" as const, weight: 1 },
  { value: "pendente" as const, weight: 1 },
  { value: "cancelado" as const, weight: 1 },
];

const ORIGIN_WEIGHTS = [
  { value: "whatsapp" as const, weight: 4 },
  { value: "manual" as const, weight: 3 },
  { value: "ecommerce" as const, weight: 1 },
  { value: "portal" as const, weight: 1 },
  { value: "pwa_externo" as const, weight: 1 },
];

const PAYMENT_CONDITIONS = ["À vista", "30 dias", "28/56 dias", "30/60/90 dias"];

interface IGenerateOrderInput {
  sequence: number;
  customer: ICustomer;
  parts: IPart[];
  /** Optional source quote that will be referenced & flipped to `convertido`. */
  sourceQuote?: IQuote;
  now?: Date;
}

export function generateOrder(ctx: ISeededContext, input: IGenerateOrderInput): IOrder {
  const id: ID = `order-${String(input.sequence + 1).padStart(4, "0")}`;
  const items = generateOrderItems(ctx, id, input.parts, input.sourceQuote);
  const subtotal = round(items.reduce((acc, it) => acc + it.total, 0));
  const discount = round((subtotal * ctx.int(0, 8)) / 100);
  const shipping = ctx.bool(0.7) ? round(ctx.int(0, 22_000) / 100) : 0;
  const total = round(subtotal - discount + shipping);
  const now = input.now ?? new Date();
  const createdAt = randomISO(ctx, daysAgo(365, now), now);
  const updatedAt = randomDate(ctx, new Date(createdAt), now).toISOString();
  const paymentStatus = pickWeighted(ctx, PAYMENT_STATUS_WEIGHTS);
  const fulfillmentStatus = pickWeighted(ctx, FULFILLMENT_STATUS_WEIGHTS);
  const hasNF = paymentStatus !== "pendente";

  return {
    id,
    storeId: SEED_STORE_ID,
    customerId: input.customer.id,
    sellerId: input.customer.sellerId,
    quoteId: input.sourceQuote?.id,
    items,
    subtotal,
    discount,
    shipping,
    total,
    paymentCondition: ctx.pick(PAYMENT_CONDITIONS),
    paymentStatus,
    fulfillmentStatus,
    origin: pickWeighted(ctx, ORIGIN_WEIGHTS),
    division: "parts",
    nfNumber: hasNF ? String(ctx.int(100_000, 999_999)) : undefined,
    nfDate: hasNF
      ? randomDate(ctx, new Date(createdAt), new Date(updatedAt)).toISOString()
      : undefined,
    notes: undefined,
    createdAt,
    updatedAt,
  };
}

function generateOrderItems(
  ctx: ISeededContext,
  orderId: ID,
  parts: IPart[],
  sourceQuote?: IQuote,
): IOrderItem[] {
  if (sourceQuote) {
    return sourceQuote.items.map((qi, i) => {
      const part = parts.find((p) => p.id === qi.partId);
      const unitCost = part ? part.unitCost : round(qi.unitPrice * 0.7);
      const marginValue = round((qi.unitPrice - unitCost) * qi.quantity - qi.discount);
      return {
        id: `oi-${orderId}-${i}`,
        partId: qi.partId,
        partSku: qi.partSku,
        partName: qi.partName,
        quantity: qi.quantity,
        unitPrice: qi.unitPrice,
        unitCost,
        discount: qi.discount,
        total: qi.total,
        marginValue,
      };
    });
  }
  const count = ctx.int(1, 5);
  const used = new Set<ID>();
  const items: IOrderItem[] = [];
  for (let i = 0; i < count; i += 1) {
    let part = ctx.pick(parts);
    let attempts = 0;
    while (used.has(part.id) && attempts < 4) {
      part = ctx.pick(parts);
      attempts += 1;
    }
    if (used.has(part.id)) continue;
    used.add(part.id);
    const quantity = ctx.int(1, 8);
    const discount = round((part.unitPrice * ctx.int(0, 10)) / 100);
    const total = round(quantity * part.unitPrice - discount);
    const marginValue = round((part.unitPrice - part.unitCost) * quantity - discount);
    items.push({
      id: `oi-${orderId}-${i}`,
      partId: part.id,
      partSku: part.sku,
      partName: part.name,
      quantity,
      unitPrice: part.unitPrice,
      unitCost: part.unitCost,
      discount,
      total,
      marginValue,
    });
  }
  return items;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
