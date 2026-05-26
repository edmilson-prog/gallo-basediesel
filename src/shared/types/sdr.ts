import type { ID, ISO8601 } from "./common";
import type { IPartIdentification } from "./part-identification";
import type { ISdrPendingQuote } from "./sdr-quote";

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
  | "aguardando_resposta_orcamento"
  | "aguardando_dados_pedido"
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
  /**
   * Pending identification waiting for a customer reply. Populated by
   * `identifyPart()` (PRD-021); cleared once the customer confirms or rejects.
   */
  pendingPartIdentification?: IPartIdentification;
  /** Full history of completed identifications — last entry first. */
  partIdentificationHistory?: IPartIdentification[];
  /** Quote produced through the PRD-022 hook (when available). */
  quoteId?: ID;
  /**
   * Quote awaiting a customer reply (PRD-022). Populated when the SDR sends
   * an orçamento; cleared when the customer accepts, rejects or escalates.
   */
  pendingQuote?: ISdrPendingQuote;
  /** Captured payment method during the post-acceptance dialog. */
  paymentMethod?: string;
  /** Captured delivery preference during the post-acceptance dialog. */
  deliveryPreference?: string;
  /** Order id created as a stub by PRD-022 when the customer accepts. */
  pendingOrderId?: ID;
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
  | {
      kind: "send_message";
      text: string;
      templateTrigger:
        | SdrTemplateTrigger
        | "part_identification"
        | "photo_placeholder"
        | "quote_generation"
        | "quote_accept"
        | "quote_reject"
        | "quote_escalate"
        | "quote_unknown"
        | "quote_expired"
        | "order_captured";
    }
  | { kind: "transition"; from: SdrSessionState; to: SdrSessionState }
  | { kind: "escalate_to_human"; reason: string }
  | { kind: "identify_part"; text: string; identification?: IPartIdentification }
  | { kind: "part_identification_resolved"; identification: IPartIdentification }
  | { kind: "create_quote"; partId?: ID; identificationId?: ID }
  | { kind: "quote_generated"; pending: ISdrPendingQuote }
  | {
      kind: "quote_response";
      intent: "accept" | "reject" | "escalate" | "negotiate" | "unknown";
      quoteId: ID;
      matchedKeywords: string[];
    }
  | { kind: "order_stub_created"; orderId: ID; quoteId: ID }
  | { kind: "finish"; reason: SdrFinishReason };

/** Trace block — kept for audit and inspector display on the simulator. */
export interface ISdrTrace {
  detectedIntent: SdrIntent | "none";
  templateUsed:
    | SdrTemplateTrigger
    | "part_identification"
    | "photo_placeholder"
    | "quote_generation"
    | "quote_accept"
    | "quote_reject"
    | "quote_escalate"
    | "quote_unknown"
    | "quote_expired"
    | "order_captured"
    | "fallback"
    | "none";
  variablesUsed: Record<string, string>;
  candidatesEvaluated: string[];
  /** Snapshot of the identification result, when the turn produced one. */
  partIdentification?: IPartIdentification;
  /** True when the identification engine fell back to stylised mocks. */
  partIdentificationUsedFallback?: boolean;
  /** True when the customer's prior pending identification was resolved this turn. */
  partIdentificationResolved?: boolean;
  /** Pending quote produced this turn — populated when a quote was generated. */
  pendingQuote?: ISdrPendingQuote;
  /** Intent detected on a customer reply to a quote, when applicable. */
  quoteResponseIntent?: "accept" | "reject" | "escalate" | "negotiate" | "unknown";
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
