import type {
  IABCClassification,
  IAuditLog,
  ICarteiraTransfer,
  ICommission,
  IConversation,
  ICustomer,
  ICustomerNote,
  ICustomerSegment,
  IDistributionTrace,
  IGamificationBadge,
  IGoal,
  ILead,
  IMessage,
  IOrder,
  IPart,
  IPositivation,
  IQuote,
  IRanking,
  IRecommendation,
  IRole,
  ISdrEscalation,
  ISdrSession,
  ISeller,
  IStore,
  IVehicle,
  IVehicleServiceEntry,
  IWhatsAppAccount,
} from "@/shared/types";

import { DEFAULT_SEED, VOLUMES } from "../config";
import { SEED_OWNER_ID, SEED_ROLES, SEED_STORE, SEED_VENDEDOR_SELLER_IDS } from "../data";
import { createSeededContext, pickWeighted } from "./utils";
import { generateSellers } from "./seller";
import { generateAudit } from "./audit";
import { generatePart, linkEquivalentParts } from "./part";
import { generateCustomerB2B, generateCustomerB2C, generateCustomerNotes } from "./customer";
import { generateVehicle, generateVehicleServiceEntry } from "./vehicle";
import { generateLead } from "./lead";
import { generateConversation } from "./conversation";
import { generateMessagesForConversation } from "./message";
import { generateQuote } from "./quote";
import { generateOrder } from "./order";
import { generateCommission } from "./commission";
import { generateGoals } from "./goal";
import { generateRecommendation } from "./recommendation";
import { generateTransfer } from "./transfer";
import { generateSegments } from "./segment";
import { generatePositivation } from "./positivation";
import { generateABC } from "./abc";
import { generateRanking } from "./ranking";
import { generateBadges } from "./badge";
import { generateWhatsAppAccounts } from "./whatsappAccount";
import { generateDistributionTrace } from "./distributionTrace";
import { generateSdrSession } from "./sdrSession";
import { generateSdrEscalation } from "./sdrEscalation";

/**
 * Full GALLO mock dataset, ready to populate the Zustand store. Generated
 * deterministically from a single integer seed.
 */
export interface IBootstrappedDataset {
  seed: number;
  generatedAt: string;
  stores: IStore[];
  roles: IRole[];
  sellers: ISeller[];
  audits: IAuditLog[];
  customers: ICustomer[];
  customerNotes: ICustomerNote[];
  vehicles: IVehicle[];
  vehicleServiceEntries: IVehicleServiceEntry[];
  leads: ILead[];
  segments: ICustomerSegment[];
  transfers: ICarteiraTransfer[];
  recommendations: IRecommendation[];
  conversations: IConversation[];
  messages: IMessage[];
  whatsappAccounts: IWhatsAppAccount[];
  parts: IPart[];
  quotes: IQuote[];
  orders: IOrder[];
  commissions: ICommission[];
  goals: IGoal[];
  badges: IGamificationBadge[];
  rankings: IRanking[];
  positivations: IPositivation[];
  abcClassifications: IABCClassification[];
  distributionTraces: IDistributionTrace[];
  sdrSessions: ISdrSession[];
  sdrEscalations: ISdrEscalation[];
}

/**
 * Build the full dataset. Order matters: every block downstream uses outputs
 * from the blocks above. A final integrity check walks every foreign key to
 * surface inconsistencies early in dev.
 */
export function bootstrap(seed: number = DEFAULT_SEED): IBootstrappedDataset {
  const ctx = createSeededContext(seed);
  const now = new Date();

  // 1. Foundational entities (no cross-deps).
  const stores: IStore[] = [{ ...SEED_STORE }];
  const roles: IRole[] = SEED_ROLES.map((r) => ({
    ...r,
    permissions: r.permissions.map((p) => ({ ...p })),
  }));
  const sellers = generateSellers();
  const whatsappAccounts = generateWhatsAppAccounts();

  // 2. Catalog — purely independent.
  const parts: IPart[] = [];
  for (let i = 0; i < VOLUMES.parts; i += 1) {
    parts.push(generatePart(ctx, { sequence: i, now }));
  }
  linkEquivalentParts(ctx, parts);

  // 3. Customers (B2B + B2C). Vendedor ids only — owner does not hold carteira.
  const customers: ICustomer[] = [];
  for (let i = 0; i < VOLUMES.customersB2B; i += 1) {
    customers.push(
      generateCustomerB2B(ctx, { sequence: i, sellerIds: SEED_VENDEDOR_SELLER_IDS, now }),
    );
  }
  for (let i = 0; i < VOLUMES.customersB2C; i += 1) {
    customers.push(
      generateCustomerB2C(ctx, { sequence: i, sellerIds: SEED_VENDEDOR_SELLER_IDS, now }),
    );
  }

  // 4. Customer notes (1–3 per customer in average — capped by VOLUMES.customerNotes).
  const customerNotes: ICustomerNote[] = [];
  let remainingNotes = VOLUMES.customerNotes;
  const customerCursor = [...customers];
  while (remainingNotes > 0 && customerCursor.length > 0) {
    const c = customerCursor[remainingNotes % customerCursor.length];
    const take = Math.min(remainingNotes, ctx.int(1, 3));
    const notes = generateCustomerNotes(ctx, c, take);
    customerNotes.push(...notes);
    c.notes.push(...notes);
    remainingNotes -= take;
  }

  // 5. Vehicles — ≥80% belong to B2B customers.
  const b2b = customers.filter((c) => c.type === "B2B");
  const b2c = customers.filter((c) => c.type === "B2C");
  const vehicles: IVehicle[] = [];
  for (let i = 0; i < VOLUMES.vehicles; i += 1) {
    const owner = ctx.bool(0.85) ? ctx.pick(b2b) : ctx.pick(b2c);
    vehicles.push(generateVehicle(ctx, { sequence: i, owner, now }));
  }

  // 6. Vehicle service history.
  const partNames = parts.map((p) => p.name);
  const vehicleServiceEntries: IVehicleServiceEntry[] = [];
  for (let i = 0; i < VOLUMES.vehicleServiceEntries; i += 1) {
    const vehicle = ctx.pick(vehicles);
    const entry = generateVehicleServiceEntry(ctx, { sequence: i, vehicle, partNames });
    vehicleServiceEntries.push(entry);
    vehicle.serviceHistory.push(entry);
  }

  // 7. Leads. Some leads convert to a B2C customer that already exists.
  const leads: ILead[] = [];
  for (let i = 0; i < VOLUMES.leads; i += 1) {
    leads.push(
      generateLead(ctx, {
        sequence: i,
        sellerIds: SEED_VENDEDOR_SELLER_IDS,
        customerIdForConversion: ctx.pick(b2c).id,
        now,
      }),
    );
  }

  // 8. Segments.
  const segments = generateSegments(ctx);

  // 9. Wallet transfers.
  const transfers: ICarteiraTransfer[] = [];
  const transferableSellers = sellers.filter((s) => SEED_VENDEDOR_SELLER_IDS.includes(s.id));
  for (let i = 0; i < VOLUMES.transfers; i += 1) {
    transfers.push(
      generateTransfer(ctx, { sequence: i, sellers: transferableSellers, customers, now }),
    );
  }

  // 10. Conversations — split between customers and leads (~80/20 with some bias).
  const whatsappAccountIds = whatsappAccounts.map((w) => w.id);
  const conversations: IConversation[] = [];
  const conversationParticipants: (
    | { kind: "customer"; entity: ICustomer }
    | { kind: "lead"; entity: ILead }
  )[] = [];
  for (let i = 0; i < VOLUMES.conversations; i += 1) {
    const participant = ctx.bool(0.7)
      ? ({ kind: "customer", entity: ctx.pick(customers) } as const)
      : ({ kind: "lead", entity: ctx.pick(leads) } as const);
    conversationParticipants.push(participant);
    conversations.push(
      generateConversation(ctx, {
        sequence: i,
        participant,
        sellerIds: SEED_VENDEDOR_SELLER_IDS,
        whatsappAccountIds,
        now,
      }),
    );
  }
  for (let i = 0; i < conversations.length; i += 1) {
    const conv = conversations[i];
    if (conv.leadId) {
      const lead = leads.find((l) => l.id === conv.leadId);
      if (lead && !lead.conversations.includes(conv.id)) lead.conversations.push(conv.id);
    }
  }

  // 11. Messages — split the global VOLUMES.messages quota proportionally across conversations.
  const messages: IMessage[] = [];
  let msgSeq = 0;
  while (messages.length < VOLUMES.messages) {
    const remaining = VOLUMES.messages - messages.length;
    const conv = conversations[messages.length % conversations.length];
    const generated = generateMessagesForConversation(ctx, conv, msgSeq);
    const take = generated.slice(0, remaining);
    messages.push(...take);
    msgSeq += take.length;
    if (take.length === 0) break;
  }

  // 12. Quotes — bound to customers or leads, items pulled from the part catalog.
  const quotes: IQuote[] = [];
  for (let i = 0; i < VOLUMES.quotes; i += 1) {
    const participant: { kind: "customer"; entity: ICustomer } | { kind: "lead"; entity: ILead } =
      ctx.bool(0.8)
        ? { kind: "customer", entity: ctx.pick(customers) }
        : { kind: "lead", entity: ctx.pick(leads) };
    quotes.push(
      generateQuote(ctx, {
        sequence: i,
        participant,
        sellerIds: SEED_VENDEDOR_SELLER_IDS,
        parts,
        now,
      }),
    );
  }

  // 13. Orders — spread over the last 12 months for BI. PRD-032 RF-006:
  // ~40% inherit from a quote, ~25% from an SDR conversation, ~35% manual.
  const orders: IOrder[] = [];
  for (let i = 0; i < VOLUMES.orders; i += 1) {
    const origin = pickWeighted(ctx, [
      { value: "fromQuote" as const, weight: 40 },
      { value: "fromConversation" as const, weight: 25 },
      { value: "manual" as const, weight: 35 },
    ]);
    const sourceQuote = origin === "fromQuote" ? ctx.pick(quotes) : undefined;
    const conversationId =
      origin === "fromConversation" && conversations.length > 0
        ? ctx.pick(conversations).id
        : undefined;
    let customer: ICustomer | undefined;
    if (sourceQuote && sourceQuote.customerId) {
      customer = customers.find((c) => c.id === sourceQuote.customerId);
    }
    if (!customer) customer = ctx.pick(customers);
    orders.push(
      generateOrder(ctx, {
        sequence: i,
        customer,
        parts,
        sourceQuote,
        conversationId,
        now,
      }),
    );
    if (sourceQuote) {
      sourceQuote.status = "convertido";
      sourceQuote.convertedToOrderId = orders[orders.length - 1].id;
    }
  }

  // 14. Commissions for paid orders only (RF-012). Cap at VOLUMES.commissions.
  const paidOrders = orders.filter((o) => o.paymentStatus === "pago");
  const commissions: ICommission[] = [];
  for (let i = 0; i < Math.min(VOLUMES.commissions, paidOrders.length); i += 1) {
    commissions.push(generateCommission(ctx, { sequence: i, order: paidOrders[i] }));
  }

  // 15. Goals (store + individual).
  const goals = generateGoals(ctx, { sellers, now });

  // 16. Recommendations — point to customers in dormente / recuperacao.
  const recommendationTargets = customers.filter(
    (c) => c.status === "dormente" || c.status === "recuperacao",
  );
  const recommendations: IRecommendation[] = [];
  for (let i = 0; i < VOLUMES.recommendations; i += 1) {
    const customer =
      recommendationTargets.length > 0 ? ctx.pick(recommendationTargets) : ctx.pick(customers);
    recommendations.push(generateRecommendation(ctx, { sequence: i, customer }));
  }

  // 17. Derived analytics — positivation, ABC, ranking, badges.
  const positivation = generatePositivation(customers, orders, now);
  const abcClassifications = generateABC(customers, orders, now);
  const ranking = generateRanking(sellers, orders, goals, now);
  const badges = generateBadges(ctx, { count: VOLUMES.badges, sellers, now });

  // 17b. Enrich each customer with the snapshots the profile (PRD-012) needs at
  // a glance: purchase stats, ABC, portal settings, and the back-pointer to the
  // originating lead (when applicable). Done after orders + ABC are computed so
  // figures match the rest of the dataset.
  enrichCustomersForProfile(ctx, { customers, orders, leads, abcClassifications, now });

  // 18. Audit log. ResourceIds drawn from the live ids generated above.
  const actorIds = sellers.map((s) => s.id);
  const resourceIds = [
    ...customers.map((c) => c.id),
    ...orders.map((o) => o.id),
    ...quotes.map((q) => q.id),
    ...transfers.map((t) => t.id),
    ...leads.map((l) => l.id),
  ];
  const audits: IAuditLog[] = [];
  for (let i = 0; i < VOLUMES.audits; i += 1) {
    audits.push(generateAudit(ctx, { sequence: i, actorIds, resourceIds }));
  }

  // 19. Distribution traces (PRD-013) — one per conversation up to ~40 so the
  // history panel renders a believable backlog. Mode is the store default.
  const distributionTraces: IDistributionTrace[] = [];
  const distMode = stores[0].settings.distribution.mode;
  const traceCount = Math.min(40, conversations.length);
  for (let i = 0; i < traceCount; i += 1) {
    distributionTraces.push(
      generateDistributionTrace(ctx, {
        sequence: i,
        conversation: conversations[i],
        customers,
        leads,
        sellers,
        mode: distMode,
        now,
      }),
    );
  }

  // 20. SDR sessions (PRD-020 + PRD-024) — 100 historical sessions across mixed
  // finish reasons. Conversations are reused cyclically so the painel SDR has a
  // believable backlog (~30/page over 4 pages) without inflating other tables.
  const sdrSessions: ISdrSession[] = [];
  const sdrSessionCount = Math.min(100, conversations.length * 2);
  for (let i = 0; i < sdrSessionCount; i += 1) {
    sdrSessions.push(
      generateSdrSession(ctx, {
        sequence: i,
        conversation: conversations[i % conversations.length],
        now,
      }),
    );
  }

  // 21. SDR escalations (PRD-023) — synthesize 30 historical handoffs from
  // sessions that finished with `escalated`. When fewer escalated sessions
  // exist than the target count, fill the rest with random sessions to give
  // the painel a believable backlog.
  const sdrEscalations: ISdrEscalation[] = [];
  const escalatedSessions = sdrSessions.filter((s) => s.finishReason === "escalated");
  const escalationPool = escalatedSessions.length > 0 ? escalatedSessions : sdrSessions;
  const escalationCount = Math.min(30, escalationPool.length);
  const escalationSellerIds = sellers
    .filter((s) => SEED_VENDEDOR_SELLER_IDS.includes(s.id))
    .map((s) => s.id);
  for (let i = 0; i < escalationCount; i += 1) {
    const session = escalationPool[i % escalationPool.length];
    const conv = conversations.find((c) => c.id === session.conversationId);
    if (!conv) continue;
    const customer = conv.customerId ? customers.find((c) => c.id === conv.customerId) : undefined;
    sdrEscalations.push(
      generateSdrEscalation(ctx, {
        sequence: i,
        session,
        conversation: conv,
        customer,
        sellerIds: escalationSellerIds,
        now,
      }),
    );
  }

  const dataset: IBootstrappedDataset = {
    seed,
    generatedAt: now.toISOString(),
    stores,
    roles,
    sellers,
    audits,
    customers,
    customerNotes,
    vehicles,
    vehicleServiceEntries,
    leads,
    segments,
    transfers,
    recommendations,
    conversations,
    messages,
    whatsappAccounts,
    parts,
    quotes,
    orders,
    commissions,
    goals,
    badges,
    rankings: [ranking],
    positivations: [positivation],
    abcClassifications,
    distributionTraces,
    sdrSessions,
    sdrEscalations,
  };

  if (import.meta.env.DEV) {
    validateReferentialIntegrity(dataset);
  }

  return dataset;
}

/**
 * Walk every foreign key and surface inconsistencies as console errors. We
 * deliberately don't throw — a broken seed should not white-screen the app in
 * dev, but it must be loud.
 */
function validateReferentialIntegrity(d: IBootstrappedDataset): void {
  const customerIds = new Set(d.customers.map((c) => c.id));
  const sellerIds = new Set(d.sellers.map((s) => s.id));
  const partIds = new Set(d.parts.map((p) => p.id));
  const leadIds = new Set(d.leads.map((l) => l.id));
  const orderIds = new Set(d.orders.map((o) => o.id));
  const errors: string[] = [];

  for (const o of d.orders) {
    if (!customerIds.has(o.customerId))
      errors.push(`order ${o.id} → customer ${o.customerId} missing`);
    if (!sellerIds.has(o.sellerId)) errors.push(`order ${o.id} → seller ${o.sellerId} missing`);
    for (const item of o.items) {
      if (!partIds.has(item.partId))
        errors.push(`order ${o.id} item → part ${item.partId} missing`);
    }
  }

  for (const v of d.vehicles) {
    if (!customerIds.has(v.customerId))
      errors.push(`vehicle ${v.id} → customer ${v.customerId} missing`);
  }

  for (const conv of d.conversations) {
    if (conv.customerId && !customerIds.has(conv.customerId))
      errors.push(`conversation ${conv.id} → customer ${conv.customerId} missing`);
    if (conv.leadId && !leadIds.has(conv.leadId))
      errors.push(`conversation ${conv.id} → lead ${conv.leadId} missing`);
    if (conv.customerId && conv.leadId)
      errors.push(`conversation ${conv.id} has both customerId and leadId`);
  }

  for (const q of d.quotes) {
    if (q.customerId && !customerIds.has(q.customerId))
      errors.push(`quote ${q.id} → customer ${q.customerId} missing`);
    if (q.leadId && !leadIds.has(q.leadId)) errors.push(`quote ${q.id} → lead ${q.leadId} missing`);
    if (q.convertedToOrderId && !orderIds.has(q.convertedToOrderId))
      errors.push(`quote ${q.id} → order ${q.convertedToOrderId} missing`);
  }

  for (const c of d.commissions) {
    if (!orderIds.has(c.orderId)) errors.push(`commission ${c.id} → order ${c.orderId} missing`);
    if (!sellerIds.has(c.sellerId))
      errors.push(`commission ${c.id} → seller ${c.sellerId} missing`);
  }

  for (const r of d.recommendations) {
    if (!sellerIds.has(r.sellerId))
      errors.push(`recommendation ${r.id} → seller ${r.sellerId} missing`);
    if (!customerIds.has(r.subjectId))
      errors.push(`recommendation ${r.id} → customer ${r.subjectId} missing`);
  }

  for (const t of d.transfers) {
    if (!sellerIds.has(t.fromSellerId))
      errors.push(`transfer ${t.id} → from ${t.fromSellerId} missing`);
    if (!sellerIds.has(t.toSellerId)) errors.push(`transfer ${t.id} → to ${t.toSellerId} missing`);
    for (const cid of t.customerIds) {
      if (!customerIds.has(cid)) errors.push(`transfer ${t.id} → customer ${cid} missing`);
    }
  }

  // Owner should never hold customers per business rule (carteira goes to vendedores).
  for (const c of d.customers) {
    if (c.sellerId === SEED_OWNER_ID) errors.push(`customer ${c.id} assigned to owner`);
  }

  if (errors.length > 0) {
    console.error(`[mock-bootstrap] ${errors.length} integrity errors:`, errors.slice(0, 20));
  }
}

/**
 * Post-process customers to attach the snapshot fields surfaced by the profile
 * (PRD-012): ticketMedio / LTV / orderCount12m, ABC class + share, portal
 * settings, and the back-pointer to the originating lead.
 *
 * Mutates each customer in place — keeps the array reference stable so the
 * mock store doesn't see an identity change. Pure with respect to orders and
 * leads (read-only on those collections).
 */
function enrichCustomersForProfile(
  ctx: ReturnType<typeof createSeededContext>,
  input: {
    customers: ICustomer[];
    orders: IOrder[];
    leads: ILead[];
    abcClassifications: IABCClassification[];
    now: Date;
  },
): void {
  const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
  const yearAgo = new Date(input.now.getTime() - ONE_YEAR_MS).toISOString();

  // Build a single pass index over orders by customer for O(N) enrichment.
  const ordersByCustomer = new Map<string, IOrder[]>();
  for (const o of input.orders) {
    const bucket = ordersByCustomer.get(o.customerId) ?? [];
    bucket.push(o);
    ordersByCustomer.set(o.customerId, bucket);
  }

  // ABC lookup — latest entry per customer (mock generator emits one period).
  const abcByCustomer = new Map(input.abcClassifications.map((a) => [a.customerId, a]));

  // Lead → customer back-pointer (only set when the lead actually converted).
  const leadByCustomer = new Map<string, ILead>();
  for (const l of input.leads) {
    if (l.convertedToCustomerId) leadByCustomer.set(l.convertedToCustomerId, l);
  }

  for (const c of input.customers) {
    const all = ordersByCustomer.get(c.id) ?? [];
    const paid = all.filter((o) => o.paymentStatus === "pago" || o.paymentStatus === "parcial");
    const last12m = paid.filter((o) => o.createdAt >= yearAgo);

    const ltv = round(paid.reduce((acc, o) => acc + o.total, 0));
    const ticketMedio =
      last12m.length > 0 ? round(last12m.reduce((acc, o) => acc + o.total, 0) / last12m.length) : 0;

    c.purchaseStats = {
      ticketMedio,
      ltv,
      orderCount12m: last12m.length,
    };

    const abc = abcByCustomer.get(c.id);
    if (abc) {
      c.abcClass = abc.class;
      c.abcShare = abc.revenueShare;
    }

    const lead = leadByCustomer.get(c.id);
    if (lead) {
      c.convertedFromLeadId = lead.id;
      // The lead was "created at" a known date and "converted" some time after — we
      // approximate the conversion timestamp midway between the lead's creation and
      // the customer's first purchase, falling back to the customer's createdAt.
      const anchorLater = c.firstPurchaseAt ?? c.createdAt;
      const earlier = new Date(lead.createdAt).getTime();
      const later = new Date(anchorLater).getTime();
      if (Number.isFinite(earlier) && Number.isFinite(later) && later > earlier) {
        c.convertedFromLeadAt = new Date(earlier + (later - earlier) / 2).toISOString();
      } else {
        c.convertedFromLeadAt = c.createdAt;
      }
      c.convertedBySellerId = lead.sellerId;
    }

    // Portal — ~55% of B2B and ~30% of B2C are provisioned; toggles vary realistically.
    const portalChance = c.type === "B2B" ? 0.55 : 0.3;
    if (ctx.bool(portalChance)) {
      const enabled = ctx.bool(0.85);
      c.portal = {
        customerId: c.id,
        enabled,
        canViewOrderHistory: enabled && ctx.bool(0.95),
        canCreateQuote: enabled && ctx.bool(0.75),
        canApproveQuote: enabled && ctx.bool(0.4),
        canSeePriceTable: enabled && ctx.bool(0.55),
        canDownloadNF: enabled && ctx.bool(0.85),
        canSeeCreditLimit: enabled && ctx.bool(0.35),
        creditLimit: enabled && c.type === "B2B" ? round(ctx.int(5_000, 80_000)) : undefined,
      };
    }
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
