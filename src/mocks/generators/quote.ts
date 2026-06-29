import type {
  ICustomer,
  ILead,
  IPart,
  IQuote,
  IQuoteItem,
  QuoteOrigin,
  QuoteStatus,
  ID,
} from "@/shared/types";
import { SEED_STORE_ID } from "../data";
import { daysAgo, pickWeighted, randomISO, type ISeededContext } from "./utils";

const STATUS_WEIGHTS: { value: QuoteStatus; weight: number }[] = [
  { value: "rascunho", weight: 10 },
  { value: "enviado", weight: 30 },
  { value: "aceito", weight: 25 },
  { value: "recusado", weight: 15 },
  { value: "expirado", weight: 10 },
  { value: "convertido", weight: 10 },
];

const ORIGIN_WEIGHTS: { value: QuoteOrigin; weight: number }[] = [
  { value: "sdr", weight: 30 },
  { value: "vendedor", weight: 40 },
  { value: "cliente_portal", weight: 5 },
  { value: "ecommerce", weight: 5 },
];

const PAYMENT_CONDITIONS = ["À vista", "30 dias", "28/56 dias", "30/60/90 dias", "Boleto faturado"];
const PAYMENT_METHODS = ["pix", "boleto", "cartao", "prazo"] as const;
const SDR_SELLER_ID: ID = "sdr-agent";

interface IGenerateQuoteInput {
  sequence: number;
  participant: { kind: "customer"; entity: ICustomer } | { kind: "lead"; entity: ILead };
  sellerIds: ID[];
  parts: IPart[];
  now?: Date;
}

export function generateQuote(ctx: ISeededContext, input: IGenerateQuoteInput): IQuote {
  const id: ID = `quote-${String(input.sequence + 1).padStart(4, "0")}`;
  const items = generateQuoteItems(ctx, id, input.parts);
  const subtotal = round(items.reduce((acc, item) => acc + item.total, 0));
  const extraDiscount = round((subtotal * ctx.int(0, 6)) / 100);
  const shipping = ctx.bool(0.6) ? round(ctx.int(0, 18_000) / 100) : 0;
  const total = round(subtotal - extraDiscount + shipping);
  const now = input.now ?? new Date();
  const createdAt = randomISO(ctx, daysAgo(60, now), now);
  const validUntil = new Date(new Date(createdAt).getTime() + 14 * 86400_000).toISOString();
  const status = pickWeighted(ctx, STATUS_WEIGHTS);
  const origin = pickWeighted(ctx, ORIGIN_WEIGHTS);
  const year = new Date(createdAt).getUTCFullYear();
  const number = `OR-${year}-${String(input.sequence + 1).padStart(4, "0")}`;
  const paymentMethod = ctx.pick(PAYMENT_METHODS);
  const paymentTerms = ctx.pick(PAYMENT_CONDITIONS);

  const discountPct = subtotal > 0 ? extraDiscount / subtotal : 0;
  const requiresApproval = discountPct > 0.05;

  return {
    id,
    storeId: SEED_STORE_ID,
    number,
    customerId: input.participant.kind === "customer" ? input.participant.entity.id : undefined,
    leadId: input.participant.kind === "lead" ? input.participant.entity.id : undefined,
    sellerId:
      origin === "sdr"
        ? SDR_SELLER_ID
        : input.participant.kind === "customer"
          ? (input.participant.entity.sellerId ?? "")
          : ctx.pick(input.sellerIds),
    items,
    subtotal,
    discount: extraDiscount,
    discountReason: requiresApproval
      ? "Cliente recorrente — fidelização há mais de 3 anos."
      : undefined,
    shipping,
    total,
    paymentCondition: paymentTerms,
    paymentMethod,
    paymentTerms,
    deliveryAddress:
      input.participant.kind === "customer" ? input.participant.entity.address : undefined,
    validUntil,
    status,
    origin,
    division: "parts",
    requiresApproval: requiresApproval && status === "rascunho",
    approvedBy: requiresApproval && status !== "rascunho" ? ctx.pick(input.sellerIds) : undefined,
    approvedAt: requiresApproval && status !== "rascunho" ? createdAt : undefined,
    notes: ctx.bool(0.3)
      ? "Orçamento gerado automaticamente — confirmar disponibilidade em estoque."
      : undefined,
    createdAt,
    updatedAt: randomISO(ctx, new Date(createdAt), now),
  };
}

function generateQuoteItems(ctx: ISeededContext, quoteId: ID, parts: IPart[]): IQuoteItem[] {
  const count = ctx.int(1, 5);
  const used = new Set<ID>();
  const items: IQuoteItem[] = [];
  for (let i = 0; i < count; i += 1) {
    let part = ctx.pick(parts);
    let attempts = 0;
    while (used.has(part.id) && attempts < 4) {
      part = ctx.pick(parts);
      attempts += 1;
    }
    if (used.has(part.id)) continue;
    used.add(part.id);
    const quantity = ctx.int(1, 6);
    const discount = round((part.unitPrice * ctx.int(0, 12)) / 100);
    const total = round(quantity * part.unitPrice - discount);
    items.push({
      id: `qi-${quoteId}-${i}`,
      partId: part.id,
      partSku: part.sku,
      partName: part.name,
      quantity,
      unitPrice: part.unitPrice,
      discount,
      total,
    });
  }
  return items;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
