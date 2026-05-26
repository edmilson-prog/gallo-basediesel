import type {
  IMessage,
  IPlatformSettings,
  ISdrAction,
  ISdrCollectedData,
  ISdrResponse,
  ISdrSession,
  ISdrTrace,
  SdrSessionState,
} from "@/shared/types";
import { renderByTrigger } from "../templates/render";
import { detectIntent } from "./intent";

/**
 * Pure response engine for the SDR agent (PRD-020).
 *
 * Inputs:
 *  - `message`: the customer utterance just received.
 *  - `session`: current session snapshot (state + collected data).
 *  - `settings`: platform settings carrying the editable templates.
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
): ISdrResponse {
  const templates = settings.sdrTemplates;
  const variables: Record<string, string | undefined> = {
    nome: session.collectedData.name,
    empresa: session.collectedData.company,
  };

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
    const updated: Partial<ISdrCollectedData> = { needs: message.text };
    const rendered = renderByTrigger(templates, "pergunta_necessidade", variables);
    trace.templateUsed = rendered.trigger;
    trace.variablesUsed = rendered.variablesUsed;
    return {
      nextState: "roteamento",
      actions: [
        { kind: "identify_part", text: message.text },
        { kind: "send_message", text: rendered.text, templateTrigger: "pergunta_necessidade" },
        { kind: "transition", from: session.state, to: "roteamento" },
      ],
      updatedCollectedData: updated,
      trace,
    };
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
  return {
    ...session,
    state: response.nextState,
    collectedData: { ...session.collectedData, ...response.updatedCollectedData },
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
