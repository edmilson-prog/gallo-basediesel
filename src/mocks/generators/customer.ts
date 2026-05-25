import type {
  ICustomer,
  ICustomerB2B,
  ICustomerB2C,
  ICustomerNote,
  ID,
  ISO8601,
} from "@/shared/types";
import { SEED_STORE_ID, SEED_TAGS } from "../data";
import {
  daysAgo,
  pickWeighted,
  randomCNPJ,
  randomCPF,
  randomDate,
  randomISO,
  randomPhone,
  type ISeededContext,
} from "./utils";

const TAG_LABELS = SEED_TAGS.map((t) => t.label);

interface IGenerateCustomerInput {
  sequence: number;
  sellerIds: ID[];
  now?: Date;
}

/** Generate a B2B customer (CNPJ-based) with a coherent lifecycle. */
export function generateCustomerB2B(
  ctx: ISeededContext,
  input: IGenerateCustomerInput,
): ICustomerB2B {
  const id: ID = `cust-b2b-${String(input.sequence + 1).padStart(4, "0")}`;
  const now = input.now ?? new Date();
  const razaoSocial = `${ctx.faker.company.name()} ${pickCompanySuffix(ctx)}`.trim();
  const nomeFantasia = razaoSocial.split(" ").slice(0, 2).join(" ");
  const sellerId = ctx.pick(input.sellerIds);
  const status = pickCustomerStatus(ctx);
  const purchase = pickPurchaseTimeline(ctx, status, now);

  return {
    id,
    type: "B2B",
    storeId: SEED_STORE_ID,
    cnpj: randomCNPJ(ctx),
    razaoSocial,
    nomeFantasia,
    contactName: ctx.faker.person.fullName(),
    email: ctx.bool(0.85) ? ctx.faker.internet.email() : undefined,
    phone: randomPhone(ctx),
    sellerId,
    status,
    tags: pickTags(ctx),
    notes: [],
    firstPurchaseAt: purchase.firstPurchaseAt,
    lastPurchaseAt: purchase.lastPurchaseAt,
    createdAt: randomISO(ctx, new Date(now.getFullYear() - 3, 0, 1), now),
  };
}

/** Generate a B2C customer (CPF-based). */
export function generateCustomerB2C(
  ctx: ISeededContext,
  input: IGenerateCustomerInput,
): ICustomerB2C {
  const id: ID = `cust-b2c-${String(input.sequence + 1).padStart(4, "0")}`;
  const now = input.now ?? new Date();
  const sellerId = ctx.pick(input.sellerIds);
  const status = pickCustomerStatus(ctx);
  const purchase = pickPurchaseTimeline(ctx, status, now);

  return {
    id,
    type: "B2C",
    storeId: SEED_STORE_ID,
    cpf: randomCPF(ctx),
    fullName: ctx.faker.person.fullName(),
    email: ctx.bool(0.7) ? ctx.faker.internet.email() : undefined,
    phone: randomPhone(ctx),
    sellerId,
    status,
    tags: pickTags(ctx),
    notes: [],
    firstPurchaseAt: purchase.firstPurchaseAt,
    lastPurchaseAt: purchase.lastPurchaseAt,
    createdAt: randomISO(ctx, new Date(now.getFullYear() - 2, 0, 1), now),
  };
}

/** Attach 1–3 free-text notes to a customer. Notes share the seller as author. */
export function generateCustomerNotes(
  ctx: ISeededContext,
  customer: ICustomer,
  count: number,
): ICustomerNote[] {
  const out: ICustomerNote[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      id: `note-${customer.id}-${i + 1}`,
      authorId: customer.sellerId,
      content: pickNoteText(ctx),
      createdAt: randomISO(ctx, daysAgo(90), new Date()),
    });
  }
  return out;
}

function pickCustomerStatus(ctx: ISeededContext): ICustomer["status"] {
  return pickWeighted(ctx, [
    { value: "ativo", weight: 6 },
    { value: "dormente", weight: 2 },
    { value: "recuperacao", weight: 1 },
    { value: "perdido", weight: 1 },
  ]);
}

function pickPurchaseTimeline(
  ctx: ISeededContext,
  status: ICustomer["status"],
  now: Date,
): { firstPurchaseAt?: ISO8601; lastPurchaseAt?: ISO8601 } {
  const firstAnchor = new Date(now.getFullYear() - 2, 0, 1);
  const firstPurchaseAt = randomISO(ctx, firstAnchor, daysAgo(30, now));
  let lastWindow: { from: Date; to: Date };
  switch (status) {
    case "ativo":
      lastWindow = { from: daysAgo(45, now), to: now };
      break;
    case "dormente":
      lastWindow = { from: daysAgo(150, now), to: daysAgo(61, now) };
      break;
    case "recuperacao":
      lastWindow = { from: daysAgo(120, now), to: daysAgo(75, now) };
      break;
    case "perdido":
      lastWindow = { from: daysAgo(540, now), to: daysAgo(181, now) };
      break;
  }
  const lastPurchaseAt = randomDate(ctx, lastWindow.from, lastWindow.to).toISOString();
  return { firstPurchaseAt, lastPurchaseAt };
}

function pickTags(ctx: ISeededContext): string[] {
  const n = ctx.int(0, 3);
  const chosen = new Set<string>();
  while (chosen.size < n) chosen.add(ctx.pick(TAG_LABELS));
  return Array.from(chosen);
}

function pickCompanySuffix(ctx: ISeededContext): string {
  return ctx.pick([
    "Ltda",
    "Transportes Ltda",
    "Logística S/A",
    "Mineradora Ltda",
    "Frota Ltda",
    "ME",
  ]);
}

function pickNoteText(ctx: ISeededContext): string {
  return ctx.pick([
    "Cliente solicitou orçamento para revisão geral da frota.",
    "Pagamento normalmente no boleto, prazo 28 dias.",
    "Atendido pelo SDR e escalado para a Marina por conhecer a frota.",
    "Reclamou de prazo de entrega na última compra. Acompanhar.",
    "Tem preferência por peças Bosch e Mahle Original.",
    "Faz revisão preventiva a cada 30 mil km — sugerir kit completo.",
    "Cliente fiel — vendedor está em recuperação ativa.",
    "Comprou volume alto no fechamento do trimestre passado.",
    "Aguarda nova cotação para troca de embreagem.",
    "Cliente VIP — alinhar precificação especial com gestor.",
  ]);
}
