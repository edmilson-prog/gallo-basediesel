import type {
  ICustomer,
  ID,
  IMessage,
  IPart,
  IPartIdentification,
  IPlatformSettings,
  IQuote,
  ISdrAction,
  ISdrCollectedData,
  ISdrPendingQuote,
  ISdrResponse,
  ISdrSession,
  ISdrTrace,
  IVehicle,
  SdrSessionState,
} from "@/shared/types";
import {
  applyCustomerChoice,
  formatConfirmationMessage,
  identifyPart,
  OEM_NOT_FOUND_MESSAGE,
  parseCustomerChoice,
  PHOTO_PLACEHOLDER_MESSAGE,
} from "@/features/part-identification";
import {
  generateSdrQuote,
  parseQuoteResponse,
  renderAcceptMessage,
  renderEscalateMessage,
  renderQuoteMessage,
  renderRejectMessage,
} from "@/features/sdr-quote";
import { renderByTrigger } from "../templates/render";
import { detectIntent } from "./intent";

/**
 * Optional context the engine can use to enrich a turn — currently scoped to
 * the PRD-021 (part identification) integration. Keeping the field optional
 * preserves the historical `sdrRespond(message, session, settings)` signature.
 */
export interface ISdrTurnContext {
  /** Catalog snapshot consumed by `identifyPart()` and `generateSdrQuote()`. */
  parts?: IPart[];
  /** Customer associated with the conversation, when known. */
  customer?: ICustomer;
  /** Pre-loaded fleet of the customer — enables vehicle reuse (RF-008). */
  vehicles?: IVehicle[];
  /** Conversation's store id — used to stamp generated quotes. */
  storeId?: ID;
  /** Seller responsible for the conversation — defaults to the SDR agent id. */
  sellerId?: ID;
}

/**
 * Pure response engine for the SDR agent (PRD-020).
 *
 * Inputs:
 *  - `message`: the customer utterance just received.
 *  - `session`: current session snapshot (state + collected data).
 *  - `settings`: platform settings carrying the editable templates.
 *  - `context`: optional catalog/customer payload that unlocks the PRD-021
 *    identification path.
 *
 * Output:
 *  - `nextState`, `actions[]`, `updatedCollectedData`, `trace`, `finishReason?`.
 *
 * The function is deterministic and free of side effects — `useSdrResponder()`
 * is the only place that turns the actions into actual `mockStore` mutations.
 * Replace this module with `langchainRespond()` on Fase 2 without touching
 * consumers.
 */
export function sdrRespond(
  message: IMessage,
  session: ISdrSession,
  settings: IPlatformSettings,
  context: ISdrTurnContext = {},
): ISdrResponse {
  const templates = settings.sdrTemplates;
  const variables: Record<string, string | undefined> = {
    nome: session.collectedData.name,
    empresa: session.collectedData.company,
  };

  // 0. Photo handling short-circuit (RF-020) — applies regardless of state.
  if (message.mediaType === "image") {
    const trace: ISdrTrace = {
      detectedIntent: "identificar_peca",
      templateUsed: "photo_placeholder",
      variablesUsed: {},
      candidatesEvaluated: ["media:image"],
    };
    return {
      nextState: session.state === "saudacao" ? "qualificacao" : session.state,
      actions: [
        {
          kind: "send_message",
          text: PHOTO_PLACEHOLDER_MESSAGE,
          templateTrigger: "photo_placeholder",
        },
      ],
      updatedCollectedData: {},
      trace,
    };
  }

  // 0bis. Awaiting payment/delivery details after the customer accepted a
  // quote — capture as a free-text note (PRD-022 RF-019).
  if (session.state === "aguardando_dados_pedido" && session.collectedData.pendingOrderId) {
    return captureOrderDetails(session, message.text);
  }

  // 0ter. A quote is pending the customer's reply — parse it and route.
  const pendingQuote = session.collectedData.pendingQuote;
  if (pendingQuote) {
    return handlePendingQuoteReply(message, session, settings, context, pendingQuote);
  }

  // 0quater. Pending part identification awaiting the customer's pick.
  const pending = session.collectedData.pendingPartIdentification;
  if (pending && pending.status === "awaiting_confirmation") {
    const resolved = resolvePendingIdentification(pending, message.text, settings, context);
    if (resolved) {
      return resolved;
    }
  }

  const intentMatch = detectIntent(message.text);
  const trace: ISdrTrace = {
    detectedIntent: intentMatch.intent,
    templateUsed: "none",
    variablesUsed: {},
    candidatesEvaluated: intentMatch.matchedKeywords,
  };

  // 1. Intent-driven shortcuts override the linear state machine.
  if (intentMatch.intent === "escalar_humano") {
    const rendered = renderByTrigger(templates, "escalacao_humano", variables);
    trace.templateUsed = rendered.trigger;
    trace.variablesUsed = rendered.variablesUsed;
    return {
      nextState: "finalizado",
      actions: [
        { kind: "send_message", text: rendered.text, templateTrigger: "escalacao_humano" },
        { kind: "escalate_to_human", reason: "customer_requested" },
        { kind: "transition", from: session.state, to: "finalizado" },
        { kind: "finish", reason: "escalated" },
      ],
      updatedCollectedData: {},
      trace,
      finishReason: "escalated",
    };
  }

  if (intentMatch.intent === "faq_horario") {
    const rendered = renderByTrigger(templates, "faq_horario", variables);
    trace.templateUsed = rendered.trigger;
    trace.variablesUsed = rendered.variablesUsed;
    return {
      nextState: session.state === "saudacao" ? "qualificacao" : session.state,
      actions: [{ kind: "send_message", text: rendered.text, templateTrigger: "faq_horario" }],
      updatedCollectedData: {},
      trace,
    };
  }

  if (intentMatch.intent === "faq_entrega") {
    const rendered = renderByTrigger(templates, "faq_entrega", variables);
    trace.templateUsed = rendered.trigger;
    trace.variablesUsed = rendered.variablesUsed;
    return {
      nextState: session.state === "saudacao" ? "qualificacao" : session.state,
      actions: [{ kind: "send_message", text: rendered.text, templateTrigger: "faq_entrega" }],
      updatedCollectedData: {},
      trace,
    };
  }

  if (intentMatch.intent === "identificar_peca") {
    return runPartIdentification(message, session, context, trace);
  }

  if (intentMatch.intent === "gerar_orcamento") {
    const rendered = renderByTrigger(templates, "pergunta_necessidade", variables);
    trace.templateUsed = rendered.trigger;
    trace.variablesUsed = rendered.variablesUsed;
    const actions: ISdrAction[] = [
      { kind: "send_message", text: rendered.text, templateTrigger: "pergunta_necessidade" },
    ];
    if (session.collectedData.identifiedPart) {
      actions.push({ kind: "create_quote", partId: session.collectedData.identifiedPart });
    }
    return {
      nextState: "roteamento",
      actions,
      updatedCollectedData: {},
      trace,
    };
  }

  // 2. Linear state machine for everything else (`texto_livre`).
  return advanceStateMachine(message, session, settings, trace);
}

/**
 * Run the PRD-021 pipeline (extract → search → decide → format) and turn it
 * into the SDR action sequence the responder hook applies. Defaults to the
 * legacy `pergunta_necessidade` template when `context.parts` is missing so
 * old call-sites (tests, ad-hoc consumers) keep working.
 */
function runPartIdentification(
  message: IMessage,
  session: ISdrSession,
  context: ISdrTurnContext,
  trace: ISdrTrace,
): ISdrResponse {
  if (!context.parts) {
    // Fall back to the original prompt when no catalog is available.
    return {
      nextState: "roteamento",
      actions: [
        { kind: "identify_part", text: message.text },
        {
          kind: "send_message",
          text: "Beleza! Pra eu identificar a peça, me diz a marca, modelo, ano do caminhão e que peça você precisa.",
          templateTrigger: "pergunta_necessidade",
        },
        { kind: "transition", from: session.state, to: "roteamento" },
      ],
      updatedCollectedData: { needs: message.text },
      trace,
    };
  }

  const result = identifyPart({
    rawInput: message.text,
    conversationId: session.conversationId,
    sessionId: session.id,
    context: { customer: context.customer, vehicles: context.vehicles },
    parts: context.parts,
  });

  const identification = result.identification;
  trace.templateUsed = "part_identification";
  trace.partIdentification = identification;
  trace.partIdentificationUsedFallback = result.usedFallbackCatalog;

  const messageText =
    identification.extractedAttributes.oemCode && identification.candidates.length === 0
      ? OEM_NOT_FOUND_MESSAGE
      : formatConfirmationMessage(
          identification.candidates,
          identification.decision,
          identification.extractedAttributes,
        );

  const updatedCollectedData: Partial<ISdrCollectedData> = {
    needs: message.text,
    pendingPartIdentification: identification,
  };

  return {
    nextState: "roteamento",
    actions: [
      { kind: "identify_part", text: message.text, identification },
      {
        kind: "send_message",
        text: messageText,
        templateTrigger: "part_identification",
      },
      { kind: "transition", from: session.state, to: "roteamento" },
    ],
    updatedCollectedData,
    trace,
  };
}

/**
 * Try to match the customer's reply to one of the candidates of the pending
 * identification. Returns `null` when the reply does not parse as a choice;
 * the caller then falls through to the regular intent pipeline.
 */
function resolvePendingIdentification(
  pending: IPartIdentification,
  text: string,
  settings: IPlatformSettings,
  context: ISdrTurnContext,
): ISdrResponse | null {
  const choice = parseCustomerChoice(text);
  if (choice === null) return null;
  const now = new Date().toISOString();
  const resolved = applyCustomerChoice(pending, choice, now);
  const trace: ISdrTrace = {
    detectedIntent: "identificar_peca",
    templateUsed: "part_identification",
    variablesUsed: {},
    candidatesEvaluated: [`choice:${choice + 1}`],
    partIdentification: resolved,
    partIdentificationResolved: true,
  };
  const chosen = resolved.candidates[choice];
  const updatedCollectedData: Partial<ISdrCollectedData> = {
    pendingPartIdentification: undefined,
  };
  const actions: ISdrAction[] = [
    { kind: "part_identification_resolved", identification: resolved },
  ];
  if (resolved.status === "confirmed" && chosen) {
    updatedCollectedData.identifiedPart = chosen.partId;
    actions.push({
      kind: "send_message",
      text: `Perfeito! Já marquei: ${chosen.partName}${chosen.oemCode ? ` (cód. ${chosen.oemCode})` : ""}. Vou preparar o orçamento.`,
      templateTrigger: "part_identification",
    });

    // Inline quote generation (PRD-022 RF-014) — only when the catalog and
    // customer are present. Otherwise fall back to emitting the legacy
    // `create_quote` action so the responder hook can handle persistence.
    const quoteOutcome = tryGenerateInlineQuote(resolved, settings, context);
    if (quoteOutcome) {
      actions.push({
        kind: "send_message",
        text: quoteOutcome.message,
        templateTrigger: "quote_generation",
      });
      actions.push({ kind: "quote_generated", pending: quoteOutcome.pending });
      actions.push({
        kind: "transition",
        from: "roteamento",
        to: "aguardando_resposta_orcamento",
      });
      trace.pendingQuote = quoteOutcome.pending;
      updatedCollectedData.pendingQuote = quoteOutcome.pending;
      return {
        nextState: "aguardando_resposta_orcamento",
        actions,
        updatedCollectedData,
        trace,
      };
    }
    actions.push({
      kind: "create_quote",
      partId: chosen.partId,
      identificationId: resolved.id,
    });
  } else {
    actions.push({
      kind: "send_message",
      text: "Sem problema! Pode me mandar mais detalhes da peça que você precisa?",
      templateTrigger: "part_identification",
    });
  }
  return {
    nextState: "roteamento",
    actions,
    updatedCollectedData,
    trace,
  };
}

/**
 * Try to generate a quote inline when the catalog and a customer are
 * available. Returns `null` (= "let the responder hook handle it") otherwise.
 */
function tryGenerateInlineQuote(
  identification: IPartIdentification,
  settings: IPlatformSettings,
  context: ISdrTurnContext,
): { quote: IQuote; pending: ISdrPendingQuote; message: string } | null {
  if (!context.parts || !context.customer) return null;
  if (!identification.customerConfirmedPartId) return null;
  const result = generateSdrQuote({
    identification,
    customer: context.customer,
    parts: context.parts,
    settings,
    sellerId: context.sellerId ?? "sdr-agent",
    storeId: context.storeId ?? context.customer.storeId,
  });
  const candidate = identification.candidates.find(
    (c) => c.partId === identification.customerConfirmedPartId,
  );
  const partTypeLabel = candidate?.isEquivalent
    ? `equivalente${candidate.partBrand ? ` ${candidate.partBrand}` : ""}`
    : `original${candidate?.partBrand ? ` ${candidate.partBrand}` : ""}`;
  const message = renderQuoteMessage(
    result.quote,
    context.customer,
    result.shipping,
    settings.sdrQuoteTemplates,
    { partTypeLabel },
  );
  const pending: ISdrPendingQuote = {
    quoteId: result.quote.id,
    total: result.quote.total,
    validUntil: result.quote.validUntil,
    partName: result.quote.items[0]?.partName ?? "Peça",
    partId: result.quote.items[0]?.partId ?? "",
    shippingIsToNegotiate: result.shipping.isToNegotiate,
    createdAt: result.quote.createdAt,
  };
  return { quote: result.quote, pending, message };
}

/**
 * Handle a customer reply received while a quote is pending. Routes through
 * `parseQuoteResponse()` and emits the appropriate template + action.
 *
 * Expired quotes short-circuit: when `now > validUntil` the engine notifies
 * the customer and re-runs the identification flow so a fresh quote can be
 * generated (PRD-022 RF-025).
 */
function handlePendingQuoteReply(
  message: IMessage,
  session: ISdrSession,
  settings: IPlatformSettings,
  context: ISdrTurnContext,
  pendingQuote: ISdrPendingQuote,
): ISdrResponse {
  const now = new Date().toISOString();
  const match = parseQuoteResponse(message.text);
  const trace: ISdrTrace = {
    detectedIntent: "gerar_orcamento",
    templateUsed: "none",
    variablesUsed: {},
    candidatesEvaluated: match.matchedKeywords,
    pendingQuote,
    quoteResponseIntent: match.intent,
  };

  const isExpired = new Date(now) > new Date(pendingQuote.validUntil);
  if (isExpired && (match.intent === "accept" || match.intent === "reject")) {
    trace.templateUsed = "quote_expired";
    return {
      nextState: "roteamento",
      actions: [
        {
          kind: "send_message",
          text: "Esse orçamento já passou da validade. Vou gerar um novo para você — me confirma a peça?",
          templateTrigger: "quote_expired",
        },
        {
          kind: "quote_response",
          intent: match.intent,
          quoteId: pendingQuote.quoteId,
          matchedKeywords: match.matchedKeywords,
        },
      ],
      updatedCollectedData: { pendingQuote: undefined },
      trace,
    };
  }

  if (match.intent === "accept") {
    const text = renderAcceptMessage(context.customer, settings.sdrQuoteTemplates);
    trace.templateUsed = "quote_accept";
    return {
      nextState: "aguardando_dados_pedido",
      actions: [
        {
          kind: "quote_response",
          intent: "accept",
          quoteId: pendingQuote.quoteId,
          matchedKeywords: match.matchedKeywords,
        },
        { kind: "send_message", text, templateTrigger: "quote_accept" },
        {
          kind: "transition",
          from: session.state,
          to: "aguardando_dados_pedido",
        },
      ],
      updatedCollectedData: { pendingQuote: undefined },
      trace,
    };
  }

  if (match.intent === "reject") {
    const text = renderRejectMessage(context.customer, settings.sdrQuoteTemplates);
    trace.templateUsed = "quote_reject";
    return {
      nextState: "roteamento",
      actions: [
        {
          kind: "quote_response",
          intent: "reject",
          quoteId: pendingQuote.quoteId,
          matchedKeywords: match.matchedKeywords,
        },
        { kind: "send_message", text, templateTrigger: "quote_reject" },
        { kind: "transition", from: session.state, to: "roteamento" },
      ],
      updatedCollectedData: { pendingQuote: undefined },
      trace,
    };
  }

  if (match.intent === "escalate" || match.intent === "negotiate") {
    const text = renderEscalateMessage(context.customer, settings.sdrQuoteTemplates);
    trace.templateUsed = "quote_escalate";
    return {
      nextState: "finalizado",
      actions: [
        {
          kind: "quote_response",
          intent: match.intent,
          quoteId: pendingQuote.quoteId,
          matchedKeywords: match.matchedKeywords,
        },
        { kind: "send_message", text, templateTrigger: "quote_escalate" },
        {
          kind: "escalate_to_human",
          reason: match.intent === "negotiate" ? "negotiation_requested" : "customer_requested",
        },
        { kind: "transition", from: session.state, to: "finalizado" },
        { kind: "finish", reason: "escalated" },
      ],
      updatedCollectedData: { pendingQuote: undefined },
      trace,
      finishReason: "escalated",
    };
  }

  // Unknown — re-prompt without clearing the pending quote.
  trace.templateUsed = "quote_unknown";
  return {
    nextState: session.state,
    actions: [
      {
        kind: "quote_response",
        intent: "unknown",
        quoteId: pendingQuote.quoteId,
        matchedKeywords: match.matchedKeywords,
      },
      {
        kind: "send_message",
        text: "Não entendi muito bem. Você quer *confirmar (1)*, *recusar (2)* ou *falar com vendedor (3)*?",
        templateTrigger: "quote_unknown",
      },
    ],
    updatedCollectedData: {},
    trace,
  };
}

/**
 * Capture payment + delivery details after the customer accepted a quote.
 * Stored on the session for downstream visibility; the responder hook turns
 * it into a conversation note. Heuristic parsing: payment method by keyword,
 * everything else falls into the delivery preference bucket.
 */
function captureOrderDetails(session: ISdrSession, text: string): ISdrResponse {
  const norm = text.toLowerCase();
  let paymentMethod: string | undefined;
  if (/\bpix\b/.test(norm)) paymentMethod = "PIX";
  else if (/boleto/.test(norm)) paymentMethod = "Boleto";
  else if (/cart[ãa]o|cartao/.test(norm)) paymentMethod = "Cartão";
  else if (/dinheiro/.test(norm)) paymentMethod = "Dinheiro";

  const trace: ISdrTrace = {
    detectedIntent: "gerar_orcamento",
    templateUsed: "order_captured",
    variablesUsed: {},
    candidatesEvaluated: paymentMethod ? [`payment:${paymentMethod}`] : [],
  };

  return {
    nextState: "finalizado",
    actions: [
      {
        kind: "send_message",
        text: paymentMethod
          ? `Anotado: ${paymentMethod}. Em instantes um vendedor confirma os detalhes da entrega com você. Obrigado!`
          : "Anotado! Em instantes um vendedor confirma os detalhes com você. Obrigado!",
        templateTrigger: "order_captured",
      },
      { kind: "transition", from: session.state, to: "finalizado" },
      { kind: "finish", reason: "completed" },
    ],
    updatedCollectedData: {
      paymentMethod,
      deliveryPreference: text,
    },
    trace,
    finishReason: "completed",
  };
}

function advanceStateMachine(
  message: IMessage,
  session: ISdrSession,
  settings: IPlatformSettings,
  trace: ISdrTrace,
): ISdrResponse {
  const templates = settings.sdrTemplates;
  const variables: Record<string, string | undefined> = {
    nome: session.collectedData.name,
    empresa: session.collectedData.company,
  };
  const text = message.text.trim();

  switch (session.state) {
    case "saudacao": {
      const greeting = renderByTrigger(templates, "saudacao", variables);
      const nameAsk = renderByTrigger(templates, "identificacao_nome", variables);
      trace.templateUsed = greeting.trigger;
      trace.variablesUsed = { ...greeting.variablesUsed, ...nameAsk.variablesUsed };
      return {
        nextState: "identificacao",
        actions: [
          { kind: "send_message", text: greeting.text, templateTrigger: "saudacao" },
          { kind: "send_message", text: nameAsk.text, templateTrigger: "identificacao_nome" },
          { kind: "transition", from: "saudacao", to: "identificacao" },
        ],
        updatedCollectedData: {},
        trace,
      };
    }
    case "identificacao": {
      if (!session.collectedData.name) {
        const name = extractName(text);
        const nextVars = { ...variables, nome: name };
        const ask = renderByTrigger(templates, "identificacao_empresa", nextVars);
        trace.templateUsed = ask.trigger;
        trace.variablesUsed = ask.variablesUsed;
        return {
          nextState: "identificacao",
          actions: [
            { kind: "send_message", text: ask.text, templateTrigger: "identificacao_empresa" },
          ],
          updatedCollectedData: { name },
          trace,
        };
      }
      const ask = renderByTrigger(templates, "pergunta_necessidade", variables);
      trace.templateUsed = ask.trigger;
      trace.variablesUsed = ask.variablesUsed;
      return {
        nextState: "qualificacao",
        actions: [
          { kind: "send_message", text: ask.text, templateTrigger: "pergunta_necessidade" },
          { kind: "transition", from: "identificacao", to: "qualificacao" },
        ],
        updatedCollectedData: { company: text },
        trace,
      };
    }
    case "qualificacao": {
      const ask = renderByTrigger(templates, "pergunta_necessidade", variables);
      trace.templateUsed = ask.trigger;
      trace.variablesUsed = ask.variablesUsed;
      return {
        nextState: "roteamento",
        actions: [
          { kind: "send_message", text: ask.text, templateTrigger: "pergunta_necessidade" },
          { kind: "transition", from: "qualificacao", to: "roteamento" },
        ],
        updatedCollectedData: { needs: text },
        trace,
      };
    }
    case "roteamento":
    case "aguardando_resposta_orcamento":
    case "aguardando_dados_pedido":
    case "aguardando_humano": {
      const ask = renderByTrigger(templates, "pergunta_necessidade", variables);
      trace.templateUsed = ask.trigger;
      trace.variablesUsed = ask.variablesUsed;
      return {
        nextState: session.state,
        actions: [
          { kind: "send_message", text: ask.text, templateTrigger: "pergunta_necessidade" },
        ],
        updatedCollectedData: { needs: text },
        trace,
      };
    }
    case "pausado":
    case "finalizado": {
      const farewell = renderByTrigger(templates, "despedida", variables);
      trace.templateUsed = farewell.trigger;
      trace.variablesUsed = farewell.variablesUsed;
      return {
        nextState: session.state,
        actions: [],
        updatedCollectedData: {},
        trace,
      };
    }
    default: {
      const _exhaustive: never = session.state;
      void _exhaustive;
      return {
        nextState: session.state,
        actions: [],
        updatedCollectedData: {},
        trace,
      };
    }
  }
}

/** Heuristic name extraction — first capitalized token, falls back to the raw text. */
function extractName(text: string): string {
  const cleaned = text.replace(/[.!?,]/g, "").trim();
  if (cleaned.length === 0) return "amigo";
  const tokens = cleaned.split(/\s+/);
  if (tokens.length === 1) return capitalize(tokens[0]);
  const introMatch = cleaned.match(/(?:sou|meu nome é|me chamo|aqui é)\s+([A-Za-zÀ-ÿ]+)/i);
  if (introMatch) return capitalize(introMatch[1]);
  return capitalize(tokens[0]);
}

function capitalize(word: string): string {
  if (word.length === 0) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Convenience helper used by the responder hook to compute the next session
 * snapshot after applying a response. Pure — does NOT touch the mock store.
 */
export function applyResponseToSession(
  session: ISdrSession,
  response: ISdrResponse,
  now: string,
): ISdrSession {
  const merged: ISdrCollectedData = {
    ...session.collectedData,
    ...response.updatedCollectedData,
  };
  // Explicit `undefined` clears the slot (used to drop pendingPartIdentification).
  for (const [key, value] of Object.entries(response.updatedCollectedData)) {
    if (value === undefined) {
      delete (merged as Record<string, unknown>)[key];
    }
  }
  // Maintain a history of resolved identifications.
  for (const action of response.actions) {
    if (action.kind === "part_identification_resolved") {
      const history = merged.partIdentificationHistory ?? [];
      merged.partIdentificationHistory = [action.identification, ...history].slice(0, 20);
    }
  }
  return {
    ...session,
    state: response.nextState,
    collectedData: merged,
    lastActivityAt: now,
    finishedAt: response.finishReason ? now : session.finishedAt,
    finishReason: response.finishReason ?? session.finishReason,
  };
}

/** Bootstrap a brand-new session for a freshly created conversation. */
export function createSdrSession(conversationId: string, now: string): ISdrSession {
  return {
    id: `sdr-${conversationId}-${Date.now()}`,
    conversationId,
    state: "saudacao",
    collectedData: {},
    startedAt: now,
    lastActivityAt: now,
  };
}

export type SdrTransitionTo = SdrSessionState;
