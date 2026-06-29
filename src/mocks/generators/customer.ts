import type {
  ICustomer,
  ICustomerAddress,
  ICustomerB2B,
  ICustomerB2C,
  ICustomerNote,
  ID,
  IPortalContract,
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

/** Demo-only: ~25% of customers carry 1–4 overdue titles. */
function pickOverdueTitlesCount(ctx: ISeededContext): number | undefined {
  if (!ctx.bool(0.25)) return undefined;
  return ctx.int(1, 4);
}

const RS_CITIES = [
  "Frederico Westphalen",
  "Iraí",
  "Palmeira das Missões",
  "Erechim",
  "Passo Fundo",
  "Santa Maria",
  "Porto Alegre",
  "Caxias do Sul",
];

const RS_DISTRICTS = ["Centro", "Industrial", "São Cristóvão", "Vila Operária", "Bela Vista"];

interface IGenerateCustomerInput {
  sequence: number;
  sellerIds: ID[];
  now?: Date;
}

/**
 * Negotiated contracts for the first B2B companies (PRD-071 RF-005/006/041).
 * Indexed by B2B sequence — only the first {@link PORTAL_ENABLED_B2B_COUNT}
 * companies are provisioned with the advanced corporate portal, matching the
 * roster seeded by `usePortalStore.seedFromCustomers`.
 */
const PORTAL_CONTRACTS: IPortalContract[] = [
  {
    discountPct: 10,
    categoryDiscounts: { filtro: 15, lubrificante: 12, freio: 8 },
    paymentTermsExtended: "30/60/90 dias",
    creditLimit: 250_000,
  },
  {
    discountPct: 7,
    categoryDiscounts: { motor: 10, embreagem: 8 },
    paymentTermsExtended: "28/56 dias",
    creditLimit: 120_000,
  },
];

/** How many of the first B2B companies are portal-enabled in the MVP seed. */
export const PORTAL_ENABLED_B2B_COUNT = PORTAL_CONTRACTS.length;

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
  const portalContract = PORTAL_CONTRACTS[input.sequence];
  // Portal-enabled companies are always active so their spend history (orders,
  // vehicles) is populated for the dashboard/analytics demo.
  const status = portalContract ? "ativo" : pickCustomerStatus(ctx);
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
    address: randomAddress(ctx),
    sellerId,
    status,
    tags: pickTags(ctx),
    notes: [],
    firstPurchaseAt: purchase.firstPurchaseAt,
    lastPurchaseAt: purchase.lastPurchaseAt,
    hasB2BPortal: portalContract !== undefined,
    portalContract,
    overdueTitlesCount: pickOverdueTitlesCount(ctx),
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
    address: ctx.bool(0.8) ? randomAddress(ctx) : undefined,
    sellerId,
    status,
    tags: pickTags(ctx),
    notes: [],
    firstPurchaseAt: purchase.firstPurchaseAt,
    lastPurchaseAt: purchase.lastPurchaseAt,
    overdueTitlesCount: pickOverdueTitlesCount(ctx),
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
      authorId: customer.sellerId ?? "",
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

function randomAddress(ctx: ISeededContext): ICustomerAddress {
  const number = String(ctx.int(10, 9999));
  const cep = `${String(ctx.int(98000, 99999))}-${String(ctx.int(0, 999)).padStart(3, "0")}`;
  // `faker.location.street()` already returns a fully-prefixed name (e.g.
  // "Rua das Acácias") in pt-BR, so we don't add another prefix to avoid
  // doubles like "Rua Rua das Acácias".
  return {
    street: ctx.faker.location.street(),
    number,
    complement: ctx.bool(0.2) ? `Sala ${ctx.int(1, 200)}` : undefined,
    district: ctx.pick(RS_DISTRICTS),
    city: ctx.pick(RS_CITIES),
    state: "RS",
    zipCode: cep,
  };
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
