import type {
  CopilotSuggestionKind,
  CopilotSuggestionSeverity,
  ICopilotBriefing,
  ICopilotPanelData,
  ICopilotSuggestion,
  ICopilotSummary,
  IConversation,
  ICustomer,
  ID,
  IMessage,
  ISdrContextSummary,
} from "@/shared/types";
import type { ICopilotProvider } from "../../contracts/copilot";
import { NotImplementedError } from "../../errors";
import { supabaseConversationsProvider } from "./conversations";
import { supabaseMessagesProvider } from "./messages";
import { supabaseCustomersProvider } from "./customers";
import { supabaseSdrEscalationsProvider } from "./sdrEscalations";

/**
 * Supabase implementation of {@link ICopilotProvider} (PRD-025).
 *
 * COMPUTED / aggregate provider — it owns no table. It reads sibling Supabase
 * providers (conversations, messages, customers, sdrEscalations) and runs a
 * pure, deterministic rules engine to derive the panel. The engine and the
 * briefing/summary helpers are ported inline here so the file is self-contained
 * (the only other copy lives in the mock impl, which we must not cross-import).
 *
 * No migration ships with this provider: there is no `copilot_*` table.
 *
 * Graceful degradation: `sdrEscalations.getByConversation` is still a Fase 2
 * stub. Its {@link NotImplementedError} is swallowed so the summary falls back
 * to the message-derived text, exactly as the mock degrades when no escalation
 * exists. `dismissSuggestion` stays a no-op (the dismissed state is local to the
 * session in `useCopilotPanel`); persistence arrives with the Fase 2
 * AICopilotProvider.
 */

const MESSAGES_PAGE_SIZE = 200;

/** Fetches every message of a conversation, ascending by `sentAt`, by paging
 *  through the provider (whose page size is clamped server-side). */
async function listAllMessages(conversationId: ID): Promise<IMessage[]> {
  const all: IMessage[] = [];
  let page = 1;
  for (;;) {
    const result = await supabaseMessagesProvider.list({
      conversationId,
      page,
      pageSize: MESSAGES_PAGE_SIZE,
      orderDir: "asc",
    });
    all.push(...result.data);
    if (all.length >= result.total || result.data.length === 0) break;
    page += 1;
  }
  return all;
}

function customerDisplayName(customer: ICustomer): string {
  return customer.type === "B2B"
    ? customer.nomeFantasia || customer.razaoSocial || customer.contactName
    : customer.fullName;
}

function daysSince(iso: string | undefined, now: Date): number | undefined {
  if (!iso) return undefined;
  const then = new Date(iso).getTime();
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

function isSameCalendarMonth(iso: string | undefined, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
}

function buildBriefing(customer: ICustomer, now: Date): ICopilotBriefing {
  return {
    customerName: customerDisplayName(customer),
    lifecycleStatus: customer.status,
    abcClass: customer.abcClass,
    averageTicket: customer.purchaseStats?.ticketMedio,
    ltv: customer.purchaseStats?.ltv,
    recencyDays: daysSince(customer.lastPurchaseAt, now),
    frequency: customer.purchaseStats
      ? `${customer.purchaseStats.orderCount12m} pedidos · 12m`
      : undefined,
    isPositivado: isSameCalendarMonth(customer.lastPurchaseAt, now),
  };
}

function summaryFromSdr(context: ISdrContextSummary): ICopilotSummary {
  const parts: string[] = [];
  if (context.partIdentified) parts.push(`Peça: ${context.partIdentified.name}`);
  if (context.vehicleIdentified) {
    parts.push(
      `Veículo: ${[context.vehicleIdentified.brand, context.vehicleIdentified.model]
        .filter(Boolean)
        .join(" ")}`,
    );
  }
  if (context.quoteGenerated) parts.push("Orçamento enviado pelo SDR");
  const text = parts.length > 0 ? parts.join(" · ") : "Conversa escalada pelo SDR.";
  return { text, source: "sdr", sdrContext: context };
}

function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function summaryFromMessages(messages: IMessage[]): ICopilotSummary | undefined {
  const inbound = messages.filter(
    (m) => m.direction === "in" && m.authorType === "customer" && m.text.trim(),
  );
  if (inbound.length === 0) return undefined;
  const first = inbound[0];
  const last = inbound[inbound.length - 1];
  // noUncheckedIndexedAccess: guard both ends even though length > 0 guarantees them.
  if (!first || !last) return undefined;
  const text =
    first.id === last.id
      ? `Cliente: "${truncate(last.text)}".`
      : `Cliente iniciou com "${truncate(first.text, 48)}". Pendência atual: "${truncate(last.text, 48)}".`;
  return { text, source: "mock" };
}

// ---------------------------------------------------------------------------
// Rules engine (pure) — ported from the mock impl (`copilotRules.ts`).
// ---------------------------------------------------------------------------

interface RuleContext {
  conversation: IConversation;
  /** Conversation messages, ascending by `sentAt`. */
  messages: IMessage[];
  customer?: ICustomer;
  now: Date;
}

/** Strips accents and normalizes case for robust pt-BR matching. */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function inboundFromCustomer(messages: IMessage[]): IMessage[] {
  return messages.filter((m) => m.direction === "in" && m.authorType === "customer");
}

function makeSuggestion(
  ctx: RuleContext,
  args: {
    kind: CopilotSuggestionKind;
    triggeredBy: string;
    title: string;
    detail?: string;
    severity: CopilotSuggestionSeverity;
  },
): ICopilotSuggestion {
  return {
    // Deterministic id → keeps "dismiss" stable across renders.
    id: `${ctx.conversation.id}::${args.triggeredBy}`,
    conversationId: ctx.conversation.id,
    customerId: ctx.conversation.customerId,
    leadId: ctx.conversation.leadId,
    storeId: ctx.conversation.storeId,
    kind: args.kind,
    source: "rule",
    title: args.title,
    detail: args.detail,
    triggeredBy: args.triggeredBy,
    severity: args.severity,
    status: "active",
    createdAt: ctx.now.toISOString(),
  };
}

const DEADLINE_TERMS = ["prazo", "entrega", "quando chega", "quando que chega", "previsao"];
const BILLING_TERMS = ["nota", "nf", "nota fiscal", "faturar", "faturamento", "fiscal"];
const COMPANY_TERMS = ["empresa", "cnpj", "razao social", "em nome da", "pessoa juridica"];
const BUYING_INTENT_TERMS = [
  "orcamento",
  "preco",
  "valor",
  "boleto",
  "cotacao",
  "parcel",
  "quanto",
];

function matchesAny(text: string, terms: string[]): boolean {
  const n = normalize(text);
  return terms.some((t) => n.includes(t));
}

/** R1 — `unanswered_deadline` (alert): ≥2 customer messages about deadline/delivery
 *  with no later seller reply, on an unresolved conversation. */
function ruleUnansweredDeadline(ctx: RuleContext): ICopilotSuggestion | null {
  if (ctx.conversation.status === "resolvida" || ctx.conversation.status === "arquivada") {
    return null;
  }
  const deadlineMsgs = inboundFromCustomer(ctx.messages).filter((m) =>
    matchesAny(m.text, DEADLINE_TERMS),
  );
  if (deadlineMsgs.length < 2) return null;
  const last = deadlineMsgs[deadlineMsgs.length - 1];
  if (!last) return null;
  const sellerRepliedAfter = ctx.messages.some(
    (m) => m.direction === "out" && m.authorType === "seller" && m.sentAt > last.sentAt,
  );
  if (sellerRepliedAfter) return null;
  return makeSuggestion(ctx, {
    kind: "alert",
    triggeredBy: "unanswered_deadline",
    title: "Cliente perguntou o prazo 2× sem resposta — confirme a entrega.",
    detail: "Há perguntas de prazo/entrega sem retorno do vendedor. Responda antes que esfrie.",
    severity: "high",
  });
}

/** R2 — `billing_mismatch` (action): a B2C (CPF) customer asks for an invoice in a
 *  company's name. */
function ruleBillingMismatch(ctx: RuleContext): ICopilotSuggestion | null {
  if (ctx.customer?.type !== "B2C") return null;
  const hit = inboundFromCustomer(ctx.messages).some(
    (m) => matchesAny(m.text, BILLING_TERMS) && matchesAny(m.text, COMPANY_TERMS),
  );
  if (!hit) return null;
  return makeSuggestion(ctx, {
    kind: "action",
    triggeredBy: "billing_mismatch",
    title: "Pediu NF em nome da empresa, mas o cadastro é B2C (CPF).",
    detail: "Confirme os dados de faturamento (CNPJ/razão social) antes de emitir.",
    severity: "medium",
  });
}

/** R3 — `dormant_opportunity` (opportunity): a dormant customer with a buying-intent
 *  signal in the current conversation. */
function ruleDormantOpportunity(ctx: RuleContext): ICopilotSuggestion | null {
  if (ctx.customer?.status !== "dormente") return null;
  const hit = inboundFromCustomer(ctx.messages).some((m) =>
    matchesAny(m.text, BUYING_INTENT_TERMS),
  );
  if (!hit) return null;
  return makeSuggestion(ctx, {
    kind: "opportunity",
    triggeredBy: "dormant_opportunity",
    title: "Cliente dormente voltando a comprar — facilite o fechamento.",
    detail: "Oferecer condição de pagamento (ex.: parcelado) costuma destravar a conversão.",
    severity: "medium",
  });
}

const KIND_ORDER: Record<CopilotSuggestionKind, number> = { alert: 0, action: 1, opportunity: 2 };
const SEVERITY_ORDER: Record<CopilotSuggestionSeverity, number> = { high: 0, medium: 1, low: 2 };

/** Runs every rule and sorts by (kind, severity). */
function runCopilotRules(ctx: RuleContext): ICopilotSuggestion[] {
  const out = [
    ruleUnansweredDeadline(ctx),
    ruleBillingMismatch(ctx),
    ruleDormantOpportunity(ctx),
  ].filter((s): s is ICopilotSuggestion => s !== null);

  return out.sort((a, b) => {
    const byKind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (byKind !== 0) return byKind;
    return SEVERITY_ORDER[a.severity ?? "low"] - SEVERITY_ORDER[b.severity ?? "low"];
  });
}

/** Resolves the SDR escalation for a conversation, tolerating the Fase 2 stub.
 *  Any {@link NotImplementedError} degrades to `null` so the panel still renders
 *  with a message-derived summary. */
async function tryGetEscalation(conversationId: ID): Promise<ISdrContextSummary | undefined> {
  try {
    const escalation = await supabaseSdrEscalationsProvider.getByConversation(conversationId);
    return escalation?.contextSummary;
  } catch (error) {
    if (error instanceof NotImplementedError) return undefined;
    throw error;
  }
}

export const supabaseCopilotProvider: ICopilotProvider = {
  async getPanelData(conversationId: ID): Promise<ICopilotPanelData> {
    const conversation = await supabaseConversationsProvider.get(conversationId);
    const messages = await listAllMessages(conversationId);
    const customer = conversation.customerId
      ? await supabaseCustomersProvider.get(conversation.customerId)
      : undefined;
    const sdrContext = await tryGetEscalation(conversationId);
    const now = new Date();

    const suggestions = runCopilotRules({ conversation, messages, customer, now });
    const briefing = customer ? buildBriefing(customer, now) : undefined;
    const summary = sdrContext ? summaryFromSdr(sdrContext) : summaryFromMessages(messages);

    return { conversationId, briefing, summary, suggestions };
  },

  async dismissSuggestion(_id: ID): Promise<void> {
    // Fase 1/2 (mock-parity): dismissal is session-local in `useCopilotPanel`.
    // Persisting it (and the audit hook) lands with the Fase 2 AICopilotProvider.
  },
};
