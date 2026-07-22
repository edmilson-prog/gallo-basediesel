import { getSupabaseClient } from "@/shared/lib/supabase";
import { extractFunctionError } from "./_functionError";
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
  ILead,
  IMessage,
  ISdrContextSummary,
  LeadOrigin,
} from "@/shared/types";
import type { ICopilotProvider, ICopilotPanelOptions } from "../../contracts/copilot";
import { NotImplementedError } from "../../errors";
import { supabaseConversationsProvider } from "./conversations";
import { supabaseMessagesProvider } from "./messages";
import { supabaseCustomersProvider } from "./customers";
import { supabaseLeadsProvider } from "./leads";
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

/** Fallback window when the caller passes none. Mirrors
 *  DEFAULT_COPILOT_ASSISTANT_SETTINGS.messageWindow — kept as a literal because
 *  this layer must not import from `src/features`. */
const DEFAULT_MESSAGE_WINDOW = 40;
const MAX_MESSAGE_WINDOW = 200;

/**
 * The most recent `window` messages, ascending by `sentAt`.
 *
 * Replaces the previous full pagination (up to 15 sequential round-trips on the
 * longest conversations) — the three keyword rules and the summary only ever
 * looked at the tail.
 */
async function listRecentMessages(conversationId: ID, window: number): Promise<IMessage[]> {
  const pageSize = Math.min(MAX_MESSAGE_WINDOW, Math.max(1, Math.floor(window)));
  const result = await supabaseMessagesProvider.list({
    conversationId,
    page: 1,
    pageSize,
    orderDir: "desc",
  });
  return [...result.data].reverse();
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
    kind: "customer",
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

const LEAD_ORIGIN_LABELS: Record<LeadOrigin, string> = {
  whatsapp: "WhatsApp",
  ecommerce: "E-commerce",
  indicacao: "Indicação",
  google: "Google",
  outro: "Outro",
  import: "Importação",
};

/** Briefing for a lead-anchored conversation: no purchase history exists, so
 *  the header shows pipeline stage and origin instead of lifecycle/ABC/ticket. */
function buildLeadBriefing(lead: ILead): ICopilotBriefing {
  return {
    kind: "lead",
    customerName: lead.name,
    leadStage: lead.stage.name,
    leadOrigin: LEAD_ORIGIN_LABELS[lead.origin],
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
      : `Últimas mensagens: "${truncate(first.text, 48)}". Pendência atual: "${truncate(last.text, 48)}".`;
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
  async getPanelData(
    conversationId: ID,
    options?: ICopilotPanelOptions,
  ): Promise<ICopilotPanelData> {
    const conversation = await supabaseConversationsProvider.get(conversationId);
    const messages = await listRecentMessages(
      conversationId,
      options?.messageWindow ?? DEFAULT_MESSAGE_WINDOW,
    );
    // Read the customer gated-once by the CONVERSATION (can_access), not the
    // per-carteira customers RLS: a POOL conversation's customer would otherwise
    // 406 on the direct get — noisy in the console on every conversation open
    // (this panel auto-fetches on open).
    const customer = conversation.customerId
      ? ((await supabaseCustomersProvider.getViaConversation(conversationId)) ?? undefined)
      : undefined;
    // Same gated-once pattern as the customer read: the per-owner leads RLS
    // hides an ownerless lead from non-staff, so a direct `get` would 406.
    const lead =
      !customer && conversation.leadId
        ? await supabaseLeadsProvider.getViaConversation(conversationId).catch(() => null)
        : null;
    const sdrContext = await tryGetEscalation(conversationId);
    const now = new Date();

    const suggestions = runCopilotRules({ conversation, messages, customer, now });
    const briefing = customer
      ? buildBriefing(customer, now)
      : lead
        ? buildLeadBriefing(lead)
        : undefined;
    const summary = sdrContext ? summaryFromSdr(sdrContext) : summaryFromMessages(messages);

    return { conversationId, briefing, summary, suggestions };
  },

  async dismissSuggestion(_id: ID): Promise<void> {
    // Fase 1/2 (mock-parity): dismissal is session-local in `useCopilotPanel`.
    // Persisting it (and the audit hook) lands with the Fase 2 AICopilotProvider.
  },

  async generateReply(conversationId: ID): Promise<string> {
    const { data, error } = await getSupabaseClient().functions.invoke("copilot-generate", {
      body: { conversationId },
    });
    if (error) throw new Error(await extractFunctionError(error));
    const text = (data as { text?: string } | null)?.text;
    if (typeof text !== "string") throw new Error("resposta inválida do servidor de IA");
    return text;
  },

  async isReplyGenerationEnabled(): Promise<boolean> {
    // Attendants cannot read ai_settings (owner-only RLS) → ask the SECURITY
    // DEFINER RPC. Fail-closed: any error hides the button.
    const { data, error } = await getSupabaseClient().rpc("ai_feature_enabled", {
      p_feature: "conversation_copilot",
    });
    if (error) return false;
    return data === true;
  },
};
