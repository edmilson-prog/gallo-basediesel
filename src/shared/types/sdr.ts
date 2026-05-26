import type { ID, ISO8601 } from "./common";

/**
 * Conversation states traversed by the SDR (Sales Development Representative)
 * agent. The state machine is intentionally simple on the MVP — every
 * transition is driven by `sdrRespond()` (pure function) so it can be replaced
 * by a real LLM on Fase 2 without touching consumers.
 *
 * @see ../../../docs/prds/PRD-020-simulacao-sdr.md
 */
export type SdrSessionState =
  | "saudacao"
  | "identificacao"
  | "qualificacao"
  | "roteamento"
  | "aguardando_humano"
  | "pausado"
  | "finalizado";

/** Why a session terminated. */
export type SdrFinishReason = "escalated" | "completed" | "abandoned" | "paused_by_human";

/** Data collected from the customer over the course of the session. */
export interface ISdrCollectedData {
  name?: string;
  company?: string;
  phone?: string;
  /** Free-text capture of the customer need. */
  needs?: string;
  /** Part identified through the PRD-021 hook (when available). */
  identifiedPart?: ID;
  /** Quote produced through the PRD-022 hook (when available). */
  quoteId?: ID;
}

/**
 * Stateful session bound 1:1 to a conversation while the SDR is driving it.
 * Closed sessions are kept for audit and metrics (PRD-024).
 */
export interface ISdrSession {
  id: ID;
  conversationId: ID;
  state: SdrSessionState;
  collectedData: ISdrCollectedData;
  lastActivityAt: ISO8601;
  startedAt: ISO8601;
  finishedAt?: ISO8601;
  finishReason?: SdrFinishReason;
  /** State the session was in when paused — used to resume cleanly. */
  pausedFromState?: SdrSessionState;
}

/** Trigger keys mapped to template entries on `IPlatformSettings.sdrTemplates`. */
export type SdrTemplateTrigger =
  | "saudacao"
  | "identificacao_nome"
  | "identificacao_empresa"
  | "pergunta_necessidade"
  | "faq_horario"
  | "faq_entrega"
  | "escalacao_humano"
  | "despedida";

/** Editable text snippet with variable placeholders (`{{nome}}`, etc.). */
export interface ISdrTemplate {
  id: ID;
  trigger: SdrTemplateTrigger;
  text: string;
  variables: string[];
}

/** Coarse intent buckets the keyword classifier emits. */
export type SdrIntent =
  | "escalar_humano"
  | "identificar_peca"
  | "gerar_orcamento"
  | "faq_horario"
  | "faq_entrega"
  | "texto_livre";

export interface ISdrIntentMatch {
  intent: SdrIntent;
  confidence: number;
  matchedKeywords: string[];
}

/** Side-effect descriptors returned by the pure engine. */
export type ISdrAction =
  | { kind: "send_message"; text: string; templateTrigger: SdrTemplateTrigger }
  | { kind: "transition"; from: SdrSessionState; to: SdrSessionState }
  | { kind: "escalate_to_human"; reason: string }
  | { kind: "identify_part"; text: string }
  | { kind: "create_quote"; partId?: ID }
  | { kind: "finish"; reason: SdrFinishReason };

/** Trace block — kept for audit and inspector display on the simulator. */
export interface ISdrTrace {
  detectedIntent: SdrIntent | "none";
  templateUsed: SdrTemplateTrigger | "fallback" | "none";
  variablesUsed: Record<string, string>;
  candidatesEvaluated: string[];
}

/** Pure response object returned by `sdrRespond()`. */
export interface ISdrResponse {
  nextState: SdrSessionState;
  actions: ISdrAction[];
  updatedCollectedData: Partial<ISdrCollectedData>;
  trace: ISdrTrace;
  /** Whether the engine considers this turn a session terminator. */
  finishReason?: SdrFinishReason;
}
