import type { ICustomer, ILead, IPart, IQuote, IQuoteItem, ID } from "@/shared/types";
import { SEED_STORE_ID } from "../data";
import { daysAgo, pickWeighted, randomDate, randomISO, type ISeededContext } from "./utils";

const STATUS_WEIGHTS = [
  { value: "rascunho" as const, weight: 10 },
  { value: "enviado" as const, weight: 10 },
  { value: "aceito" as const, weight: 5 },
  { value: "recusado" as const, weight: 3 },
  { value: "expirado" as const, weight: 1 },
  { value: "convertido" as const, weight: 1 },
];

const ORIGIN_WEIGHTS = [
  { value: "sdr" as const, weight: 2 },
  { value: "vendedor" as const, weight: 6 },
  { value: "cliente_portal" as const, weight: 1 },
  { value: "ecommerce" as const, weight: 1 },
];

const PAYMENT_CONDITIONS = ["À vista", "30 dias", "28/56 dias", "30/60/90 dias", "Boleto faturado"];

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

  return {
    id,
    storeId: SEED_STORE_ID,
    customerId: input.participant.kind === "customer" ? input.participant.entity.id : undefined,
    leadId: input.participant.kind === "lead" ? input.participant.entity.id : undefined,
    sellerId:
      input.participant.kind === "customer"
        ? input.participant.entity.sellerId
        : ctx.pick(input.sellerIds),
    items,
    subtotal,
    discount: extraDiscount,
    shipping,
    total,
    paymentCondition: ctx.pick(PAYMENT_CONDITIONS),
    validUntil,
    status,
    origin: pickWeighted(ctx, ORIGIN_WEIGHTS),
    division: "parts",
    notes: ctx.bool(0.3)
      ? "Orçamento gerado automaticamente — confirmar disponibilidade em estoque."
      : undefined,
    createdAt,
    updatedAt: randomDate(ctx, new Date(createdAt), now).toISOString(),
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
