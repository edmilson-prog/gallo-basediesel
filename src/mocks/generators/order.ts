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

interface IGenerateOrderInput {
  sequence: number;
  customer: ICustomer;
  parts: IPart[];
  /** Optional source quote that will be referenced & flipped to `convertido`. */
  sourceQuote?: IQuote;
  /** Optional conversation that originated the order (SDR / inbox). */
  conversationId?: ID;
  now?: Date;
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
  const createdAt = randomISO(ctx, daysAgo(365, now), now);
  const updatedAt = randomDate(ctx, new Date(createdAt), now).toISOString();
  const profile = pickWeighted(ctx, STATUS_WEIGHTS);
  const resolved = resolveStatus(ctx, profile, createdAt, updatedAt);
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
