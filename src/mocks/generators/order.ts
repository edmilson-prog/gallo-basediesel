import type {
  ICommissionPreview,
  ICustomer,
  IOrder,
  IOrderItem,
  IPart,
  IQuote,
  ID,
  OrderFulfillmentStatus,
  OrderOrigin,
  OrderPaymentMethod,
  OrderPaymentStatus,
} from "@/shared/types";
import { SEED_STORE_ID } from "../data";
import { daysAgo, pickWeighted, randomDate, randomISO, type ISeededContext } from "./utils";

/**
 * Aggregate status profile used to bias the dataset distribution (PRD-032 RF-005).
 * Each profile resolves to a coherent (paymentStatus, fulfillmentStatus) pair so
 * computeOrderStatus() reproduces the intended distribution.
 */
type StatusProfile =
  | "aguardando_pagamento"
  | "concluido"
  | "enviado"
  | "em_separacao"
  | "cancelado"
  | "devolvido"
  | "pago_aguardando_envio";

const STATUS_WEIGHTS: Array<{ value: StatusProfile; weight: number }> = [
  { value: "aguardando_pagamento", weight: 30 },
  { value: "concluido", weight: 25 },
  { value: "enviado", weight: 15 },
  { value: "em_separacao", weight: 10 },
  { value: "cancelado", weight: 10 },
  { value: "pago_aguardando_envio", weight: 5 },
  { value: "devolvido", weight: 5 },
];

const ORIGIN_WEIGHTS = [
  { value: "whatsapp" as const, weight: 4 },
  { value: "manual" as const, weight: 3 },
  { value: "ecommerce" as const, weight: 1 },
  { value: "portal" as const, weight: 1 },
  { value: "pwa_externo" as const, weight: 1 },
];

const PAYMENT_METHOD_WEIGHTS = [
  { value: "pix" as const, weight: 4 },
  { value: "boleto" as const, weight: 3 },
  { value: "prazo" as const, weight: 2 },
  { value: "cartao" as const, weight: 2 },
  { value: "outro" as const, weight: 1 },
];

const PAYMENT_CONDITIONS = ["À vista", "30 dias", "28/56 dias", "30/60/90 dias"];
const CARRIERS = ["Mercúrio", "Jadlog", "Braspress", "Patrus", "TNT", "Correios"];

/** Status profiles whose payment resolves to `pago` (counts as realized revenue). */
const PAID_PROFILE_WEIGHTS: Array<{ value: StatusProfile; weight: number }> = [
  { value: "concluido", weight: 50 },
  { value: "enviado", weight: 25 },
  { value: "em_separacao", weight: 15 },
  { value: "pago_aguardando_envio", weight: 10 },
];

/** Status profiles that keep an order out of realized revenue (pending/refunded). */
const UNPAID_PROFILE_WEIGHTS: Array<{ value: StatusProfile; weight: number }> = [
  { value: "aguardando_pagamento", weight: 65 },
  { value: "cancelado", weight: 20 },
  { value: "devolvido", weight: 15 },
];

interface IGenerateOrderInput {
  sequence: number;
  customer: ICustomer;
  parts: IPart[];
  /** Optional source quote that will be referenced & flipped to `convertido`. */
  sourceQuote?: IQuote;
  /** Optional conversation that originated the order (SDR / inbox). */
  conversationId?: ID;
  now?: Date;
  /** Pin the order's `createdAt` (ISO). When omitted, a random date in the last year is used. */
  createdAt?: string;
  /** Force a specific status profile instead of the weighted default. */
  forceProfile?: StatusProfile;
}

interface IStatusResolution {
  paymentStatus: OrderPaymentStatus;
  fulfillmentStatus: OrderFulfillmentStatus;
  paidAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  canceledAt?: string;
  canceledBy?: ID;
  cancelReason?: string;
  returnedAt?: string;
  returnReason?: string;
}

export function generateOrder(ctx: ISeededContext, input: IGenerateOrderInput): IOrder {
  const id: ID = `order-${String(input.sequence + 1).padStart(4, "0")}`;
  const items = generateOrderItems(ctx, id, input.parts, input.sourceQuote);
  const subtotal = round(items.reduce((acc, it) => acc + it.total, 0));
  const discount = round((subtotal * ctx.int(0, 8)) / 100);
  const shipping = ctx.bool(0.7) ? round(ctx.int(0, 22_000) / 100) : 0;
  const total = round(subtotal - discount + shipping);
  const now = input.now ?? new Date();
  const createdAt = input.createdAt ?? randomISO(ctx, daysAgo(365, now), now);
  const updatedAt = randomDate(ctx, new Date(createdAt), now).toISOString();
  const profile = input.forceProfile ?? pickWeighted(ctx, STATUS_WEIGHTS);
  const resolved = resolveStatus(ctx, profile, createdAt, updatedAt);
  // When the order is explicitly dated, settle the payment on the same day so
  // daily revenue series (which bucket by `paidAt`) attribute it to its day.
  if (input.createdAt && resolved.paymentStatus === "pago") {
    resolved.paidAt = createdAt;
  }
  const paymentMethod = pickWeighted(ctx, PAYMENT_METHOD_WEIGHTS);
  const hasNF =
    resolved.paymentStatus === "pago" ||
    resolved.paymentStatus === "parcial" ||
    resolved.fulfillmentStatus === "expedido" ||
    resolved.fulfillmentStatus === "entregue";

  const year = new Date(createdAt).getUTCFullYear();
  const number = `PD-${year}-${String(input.sequence + 1).padStart(4, "0")}`;

  const baseValue = round(Math.max(0, subtotal - discount));
  const commissionPreview: ICommissionPreview = {
    baseValue,
    commissionRate: 0.03,
    estimatedCommission: round(baseValue * 0.03),
    rules: ["Taxa padrão da loja: 3%", "Base = subtotal − desconto (sem frete)"],
    finalCalculationInPRD047: true,
  };

  const hasShippingInfo =
    resolved.fulfillmentStatus === "expedido" || resolved.fulfillmentStatus === "entregue";

  const origin: OrderOrigin = input.sourceQuote
    ? "manual"
    : input.conversationId
      ? "whatsapp"
      : pickWeighted(ctx, ORIGIN_WEIGHTS);

  return {
    id,
    storeId: SEED_STORE_ID,
    customerId: input.customer.id,
    sellerId: input.customer.sellerId,
    number,
    quoteId: input.sourceQuote?.id,
    conversationId: input.conversationId,
    items,
    subtotal,
    discount,
    shipping,
    total,
    paymentCondition: ctx.pick(PAYMENT_CONDITIONS),
    paymentMethod,
    paymentTerms: ctx.pick(PAYMENT_CONDITIONS),
    paymentStatus: resolved.paymentStatus,
    paidAt: resolved.paidAt,
    fulfillmentStatus: resolved.fulfillmentStatus,
    deliveryAddress: input.customer.address,
    carrier: hasShippingInfo ? ctx.pick(CARRIERS) : undefined,
    trackingCode: hasShippingInfo
      ? `${randomTrackingPrefix(ctx)}${ctx.int(100000, 999999)}BR`
      : undefined,
    shippedAt: resolved.shippedAt,
    deliveredAt: resolved.deliveredAt,
    returnedAt: resolved.returnedAt,
    returnReason: resolved.returnReason,
    origin,
    division: "parts",
    nfNumber: hasNF ? String(ctx.int(100_000, 999_999)) : undefined,
    nfDate: hasNF
      ? randomDate(ctx, new Date(createdAt), new Date(updatedAt)).toISOString()
      : undefined,
    canceledAt: resolved.canceledAt,
    canceledBy: resolved.canceledBy,
    cancelReason: resolved.cancelReason,
    commissionPreview,
    notes: undefined,
    createdAt,
    updatedAt,
  };
}

function resolveStatus(
  ctx: ISeededContext,
  profile: StatusProfile,
  createdAt: string,
  updatedAt: string,
): IStatusResolution {
  const start = new Date(createdAt);
  const end = new Date(updatedAt);
  const midway = () => randomDate(ctx, start, end).toISOString();
  switch (profile) {
    case "aguardando_pagamento":
      return { paymentStatus: "pendente", fulfillmentStatus: "pendente" };
    case "pago_aguardando_envio":
      return {
        paymentStatus: "pago",
        fulfillmentStatus: "pendente",
        paidAt: midway(),
      };
    case "em_separacao":
      return {
        paymentStatus: "pago",
        fulfillmentStatus: "separacao",
        paidAt: midway(),
      };
    case "enviado":
      return {
        paymentStatus: "pago",
        fulfillmentStatus: "expedido",
        paidAt: midway(),
        shippedAt: midway(),
      };
    case "concluido":
      return {
        paymentStatus: "pago",
        fulfillmentStatus: "entregue",
        paidAt: midway(),
        shippedAt: midway(),
        deliveredAt: midway(),
      };
    case "cancelado":
      return {
        paymentStatus: ctx.bool(0.5) ? "pendente" : "pago",
        fulfillmentStatus: "cancelado",
        canceledAt: midway(),
        canceledBy: "system",
        cancelReason: ctx.pick([
          "Cliente desistiu",
          "Item fora de estoque",
          "Endereço incorreto",
          "Cliente encontrou peça mais barata",
        ]),
      };
    case "devolvido":
      return {
        paymentStatus: "estornado",
        fulfillmentStatus: "devolvido",
        paidAt: midway(),
        shippedAt: midway(),
        deliveredAt: midway(),
        returnedAt: midway(),
        returnReason: ctx.pick([
          "Peça incompatível com o veículo",
          "Defeito de fabricação",
          "Cliente trocou de fornecedor",
        ]),
      };
  }
}

function randomTrackingPrefix(ctx: ISeededContext): string {
  return ctx.pick(["ME", "BR", "JD", "TN", "PT"]);
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

interface IGenerateTimelineInput {
  customers: ICustomer[];
  parts: IPart[];
  /** Quotes eligible to be converted into an order (flipped to `convertido`). */
  quotes: IQuote[];
  /** Conversation ids that can originate WhatsApp/SDR orders. */
  conversationIds: ID[];
  /** Full monthly revenue target driving daily volume (e.g. store revenue goal). */
  monthlyTarget: number;
  /** "Today" — the timeline never produces orders dated after this. */
  now?: Date;
  /** Days of history to span backwards from `now` (default 365). */
  historyDays?: number;
}

const TIMELINE_ORIGIN_WEIGHTS = [
  { value: "fromQuote" as const, weight: 40 },
  { value: "fromConversation" as const, weight: 25 },
  { value: "manual" as const, weight: 35 },
];

/** Business days assumed per month when spreading the monthly target. */
const BUSINESS_DAYS_PER_MONTH = 21;
/**
 * Fraction of the monthly target the store actually realizes — keeps the
 * cumulative line tracking just below the objective (visible, healthy gap).
 */
const REALIZED_PACE = 0.88;
/** Reference ticket used to translate a daily revenue target into order count. */
const REFERENCE_TICKET = 34_000;

/** Random business-hour ISO timestamp on `day`, never after `now`. */
function businessTimeOn(ctx: ISeededContext, day: Date, now: Date): string {
  const d = new Date(day);
  d.setHours(ctx.int(8, 18), ctx.int(0, 59), ctx.int(0, 59), 0);
  if (d.getTime() > now.getTime()) {
    // Same day as "today" but later than now → pull back into the past hour.
    return new Date(now.getTime() - ctx.int(0, 3_600_000)).toISOString();
  }
  return d.toISOString();
}

/**
 * Generate a realistic order stream spread day-by-day across the last
 * `historyDays`. Business days carry 1–2 paid orders (with daily variance and a
 * gentle month-over-month growth trend); weekends produce no sales at all
 * (business runs Mon–Fri), so the cumulative revenue line stays flat across
 * Sat/Sun. Monthly paid revenue lands near `monthlyTarget * REALIZED_PACE`, so
 * every time-series chart (daily evolution + 12-month) stays consistent with
 * the revenue goal.
 */
export function generateOrdersTimeline(
  ctx: ISeededContext,
  input: IGenerateTimelineInput,
): IOrder[] {
  const now = input.now ?? new Date();
  const historyDays = input.historyDays ?? 365;
  const dailyBase = (input.monthlyTarget * REALIZED_PACE) / BUSINESS_DAYS_PER_MONTH;

  const orders: IOrder[] = [];
  let sequence = 0;

  const makeOrder = (day: Date, paid: boolean): IOrder => {
    const origin = pickWeighted(ctx, TIMELINE_ORIGIN_WEIGHTS);
    const sourceQuote =
      origin === "fromQuote" && input.quotes.length > 0 ? ctx.pick(input.quotes) : undefined;
    const conversationId =
      origin === "fromConversation" && input.conversationIds.length > 0
        ? ctx.pick(input.conversationIds)
        : undefined;

    let customer: ICustomer | undefined;
    if (sourceQuote?.customerId) {
      customer = input.customers.find((c) => c.id === sourceQuote.customerId);
    }
    if (!customer) customer = ctx.pick(input.customers);

    const profile = pickWeighted(ctx, paid ? PAID_PROFILE_WEIGHTS : UNPAID_PROFILE_WEIGHTS);
    const order = generateOrder(ctx, {
      sequence,
      customer,
      parts: input.parts,
      sourceQuote,
      conversationId,
      now,
      createdAt: businessTimeOn(ctx, day, now),
      forceProfile: profile,
    });
    sequence += 1;
    if (sourceQuote) {
      sourceQuote.status = "convertido";
      sourceQuote.convertedToOrderId = order.id;
    }
    orders.push(order);
    return order;
  };

  const startDay = daysAgo(historyDays, now);
  const cursor = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate());
  const endDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  while (cursor.getTime() <= endDay.getTime()) {
    const weekday = cursor.getDay();
    const isWeekend = weekday === 0 || weekday === 6;

    // Business runs Mon–Fri only: weekends produce no sales, so the cumulative
    // revenue line stays flat at the last business day's value (Sat/Sun mirror
    // the previous Friday).
    if (isWeekend) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }

    const monthsAgo =
      (now.getFullYear() - cursor.getFullYear()) * 12 + (now.getMonth() - cursor.getMonth());
    // Gentle upward trend: ~0.68x twelve months ago → 1.0x in the current month.
    const growth = 0.68 + 0.32 * (1 - Math.min(monthsAgo, 11) / 11);

    const jitter = 0.6 + ctx.rng() * 0.8; // 0.6 .. 1.4
    const dayTarget = dailyBase * growth * jitter;
    const exactCount = dayTarget / REFERENCE_TICKET;
    let count = Math.floor(exactCount);
    if (ctx.rng() < exactCount - count) count += 1;
    count = Math.max(1, count); // a business day always sees at least one sale
    for (let i = 0; i < count; i += 1) makeOrder(cursor, true);
    // A few pending/cancelled/returned orders for status variety.
    const fillers = ctx.int(0, 1);
    for (let i = 0; i < fillers; i += 1) makeOrder(cursor, false);

    cursor.setDate(cursor.getDate() + 1);
  }

  return orders;
}
