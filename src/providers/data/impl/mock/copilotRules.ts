import type {
  IConversation,
  IMessage,
  ICustomer,
  ICopilotSuggestion,
  CopilotSuggestionKind,
  CopilotSuggestionSeverity,
} from "@/shared/types";

export interface ICopilotRuleContext {
  conversation: IConversation;
  /** Mensagens da conversa, ordem ascendente por sentAt. */
  messages: IMessage[];
  customer?: ICustomer;
  now: Date;
}

/** Remove acentos e normaliza caixa para casamento robusto em pt-BR. */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function inboundFromCustomer(messages: IMessage[]): IMessage[] {
  return messages.filter((m) => m.direction === "in" && m.authorType === "customer");
}

function makeSuggestion(
  ctx: ICopilotRuleContext,
  args: {
    kind: CopilotSuggestionKind;
    triggeredBy: string;
    title: string;
    detail?: string;
    severity: CopilotSuggestionSeverity;
  },
): ICopilotSuggestion {
  return {
    // ID determinístico → estabiliza o "dispensar" entre renders.
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

/**
 * R1 — `unanswered_deadline` (alert): ≥2 mensagens do cliente sobre prazo/entrega
 * sem mensagem posterior do vendedor, e conversa não resolvida.
 */
export function ruleUnansweredDeadline(ctx: ICopilotRuleContext): ICopilotSuggestion | null {
  if (ctx.conversation.status === "resolvida" || ctx.conversation.status === "arquivada") {
    return null;
  }
  const deadlineMsgs = inboundFromCustomer(ctx.messages).filter((m) =>
    matchesAny(m.text, DEADLINE_TERMS),
  );
  if (deadlineMsgs.length < 2) return null;
  const last = deadlineMsgs[deadlineMsgs.length - 1];
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

/**
 * R2 — `billing_mismatch` (action): cliente B2C (CPF) pede NF/faturamento em nome
 * de empresa.
 */
export function ruleBillingMismatch(ctx: ICopilotRuleContext): ICopilotSuggestion | null {
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

/**
 * R3 — `dormant_opportunity` (opportunity): cliente dormente com sinal de intenção
 * de compra na conversa atual.
 */
export function ruleDormantOpportunity(ctx: ICopilotRuleContext): ICopilotSuggestion | null {
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

/** Roda todas as regras e ordena por (kind, severidade). */
export function runCopilotRules(ctx: ICopilotRuleContext): ICopilotSuggestion[] {
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
