import type { ABCClass } from "./bi";
import type { CustomerStatus } from "./customer";
import type { ID, ISO8601, Money } from "./common";
import type { RoleName } from "./people";
import type { ISdrContextSummary } from "./sdr-escalation";

/** Tipo de orientação que o copiloto emite. */
export type CopilotSuggestionKind = "alert" | "action" | "opportunity";

/** Origem da sugestão. Fase 1 sempre "rule"; Fase 2 habilita "ai". */
export type CopilotSuggestionSource = "rule" | "ai";

export type CopilotSuggestionSeverity = "low" | "medium" | "high";

export type CopilotSuggestionStatus = "active" | "dismissed" | "acted";

/** Posição da superfície do copiloto na tela de atendimento. */
export type CopilotPlacement = "strip" | "tab" | "card";

/**
 * Orientação privada ao vendedor, derivada de uma regra (Fase 1) ou do motor de
 * IA (Fase 2). Nunca trafega para o cliente. Ver PRD-025.
 */
export interface ICopilotSuggestion {
  id: ID;
  conversationId: ID;
  customerId?: ID;
  leadId?: ID;
  storeId: ID;
  kind: CopilotSuggestionKind;
  source: CopilotSuggestionSource;
  /** Orientação curta exibida ao vendedor. */
  title: string;
  /** Complemento opcional, revelado ao expandir. */
  detail?: string;
  /** Identificador da regra/sinal (ex.: "unanswered_deadline"). */
  triggeredBy: string;
  severity?: CopilotSuggestionSeverity;
  /** Liga a uma IRecommendation quando a sugestão deriva de uma já existente. */
  relatedRecommendationId?: ID;
  status: CopilotSuggestionStatus;
  createdAt: ISO8601;
}

/**
 * Extrato de contexto do cliente. Reflete os MESMOS valores da Ficha (PRD-012),
 * sem recomputar — referência, não recálculo.
 */
export interface ICopilotBriefing {
  customerName: string;
  lifecycleStatus: CustomerStatus;
  abcClass?: ABCClass;
  averageTicket?: Money;
  ltv?: Money;
  recencyDays?: number;
  /** Texto curto de frequência, ex.: "4 pedidos · 12m". */
  frequency?: string;
  primaryVehicle?: { brand: string; model?: string };
  isPositivado?: boolean;
}

export type CopilotSummarySource = "sdr" | "mock";

/** Resumo da conversa apresentado pelo copiloto. */
export interface ICopilotSummary {
  text: string;
  source: CopilotSummarySource;
  /** Presente quando o resumo deriva do handoff do SDR (PRD-023). */
  sdrContext?: ISdrContextSummary;
}

/**
 * Agregado consumido pela superfície do copiloto.
 *
 * Nota de arquitetura: diferente do rascunho do PRD-025, `placement` NÃO vive
 * aqui — é configuração de front (build-time, `VITE_COPILOT_PLACEMENT`), resolvida
 * por `useCopilotPlacement`, não um dado do provider.
 */
export interface ICopilotPanelData {
  conversationId: ID;
  briefing?: ICopilotBriefing;
  summary?: ICopilotSummary;
  suggestions: ICopilotSuggestion[];
}

/** Which conversations the assistant acts on. */
export type CopilotReach = "all" | "customer_only" | "lead_only";

/** When the analysis runs. Only meaningful once `engine === "ai"` (sub-project B). */
export type CopilotTrigger = "on_demand" | "on_open" | "on_new_message";

/** Which engine produces summary and suggestions. */
export type CopilotEngine = "rules" | "ai";

/**
 * Conversation-assistant behaviour (spec 2026-07-22). Stored at
 * `stores.settings->'copilotAssistant'`; absent → DEFAULT_COPILOT_ASSISTANT_SETTINGS.
 *
 * The panel PLACEMENT is deliberately NOT here: it stays a per-person
 * preference in localStorage (`gallo-copilot-placement`), because it is taste,
 * not operational policy.
 */
export interface ICopilotAssistantSettings {
  enabled: boolean;
  reach: CopilotReach;
  /** WhatsApp accounts the assistant acts on. Empty → every account. */
  accountIds: ID[];
  /** Roles that see the panel. */
  roles: RoleName[];

  trigger: CopilotTrigger;
  /** Minutes an analysis stays valid before being redone (sub-project B). */
  cacheMinutes: number;
  /** New inbound messages required before redoing an analysis (sub-project B). */
  minNewMessages: number;
  /** How many recent messages the assistant reads. */
  messageWindow: number;

  showSummary: boolean;
  showSuggestions: boolean;
  showReplyButton: boolean;
  /** Open the panel automatically when there is at least one suggestion. */
  autoExpandOnAlert: boolean;

  engine: CopilotEngine;
  /** Assistant's own monthly cap in BRL, inside the platform-wide cap. 0 = none. */
  monthlyCapBRL: number;
  /** Percentage of the own cap that notifies the Owner. */
  alertThresholdPct: number;
}
