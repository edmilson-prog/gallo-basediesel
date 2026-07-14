import type { ID, ISO8601, Money } from "./common";

/**
 * SDR → human handoff (PRD-023).
 *
 * Created whenever the SDR transfers a conversation to a real seller. The
 * record carries the contextual snapshot (cliente / veículo / peça / orçamento)
 * the receiving seller needs to pick up the conversation without reading the
 * whole transcript, plus the mode (`urgent` / `normal` / `standard`) that
 * drives downstream behaviour (broadcast, queue timeouts, toast urgency).
 *
 * @see ../../../docs/prds/PRD-023-escalonamento-sdr.md
 */
export type SdrEscalationReason =
  | "customer_requested"
  | "negotiation_detected"
  | "sdr_failed"
  | "complexity"
  | "out_of_scope"
  /** Normal triage handoff (v1 pilot) — qualification complete, real need identified. Not an exception path. */
  | "qualified_handoff";

export type SdrEscalationMode = "urgent" | "normal" | "standard";

export type SdrEscalationStatus = "pending" | "assigned" | "answered" | "abandoned";

/** Vehicle slice composed for the bubble — extracted from collected data. */
export interface ISdrEscalationVehicle {
  brand: string;
  model?: string;
  year?: number;
  engine?: string;
}

/** Part slice composed for the bubble — extracted from the identification. */
export interface ISdrEscalationPart {
  id: ID;
  name: string;
  oemCode?: string;
  isOriginal: boolean;
}

/** Quote slice composed for the bubble — extracted from the pending quote. */
export interface ISdrEscalationQuote {
  id: ID;
  total: Money;
  validUntil: ISO8601;
  status: string;
  shippingIsToNegotiate: boolean;
}

/** SDR step traversed during the session — used for the audit-only trace. */
export interface ISdrEscalationTraceStep {
  step: string;
  timestamp: ISO8601;
  details?: string;
}

/**
 * Snapshot of the SDR conversation state at handoff time. Composed by
 * `buildContextSummary()` and rendered both as a system bubble in the chat and
 * as a short summary inside the customer-facing handoff message.
 */
export interface ISdrContextSummary {
  customerName?: string;
  customerCompany?: string;
  customerPhone: string;
  isB2B: boolean;
  vehicleIdentified?: ISdrEscalationVehicle;
  partIdentified?: ISdrEscalationPart;
  quoteGenerated?: ISdrEscalationQuote;
  /** Free-form reason text rendered next to the structured reason code. */
  reasonText?: string;
  /** Total messages exchanged with the customer during the SDR session. */
  conversationLength: number;
  /** Seconds elapsed between session start and handoff. */
  timeInSdr: number;
  /** Free-form key/value bag (everything `ISdrCollectedData` carried). */
  collectedData: Record<string, unknown>;
  /** Coarse trace of SDR state transitions — populated when available. */
  sdrTrace: ISdrEscalationTraceStep[];
}

/**
 * Persistent escalation record. One per handoff event; stays around for audit
 * and analytics (PRDs 014 + 024) even after the conversation is closed.
 */
export interface ISdrEscalation {
  id: ID;
  sessionId: ID;
  conversationId: ID;
  customerId?: ID;
  leadId?: ID;
  storeId: ID;
  reason: SdrEscalationReason;
  /** Human-readable detail (e.g. the customer phrase that triggered it). */
  reasonDetails?: string;
  mode: SdrEscalationMode;
  contextSummary: ISdrContextSummary;
  assignedSellerId?: ID;
  assignedAt?: ISO8601;
  /** First outbound message from the seller after assignment (TTFR anchor). */
  firstHumanResponseAt?: ISO8601;
  status: SdrEscalationStatus;
  /** True when chooseHumanSeller picked a seller whose specialty matched. */
  specialtyMatched?: boolean;
  /**
   * Set when modo urgent broadcasted because the assigned seller stayed
   * silent past the broadcast delay. Records which seller(s) saw the alert
   * and which one finally took the conversation.
   */
  urgentBroadcastAt?: ISO8601;
  urgentBroadcastClaimedBySellerId?: ID;
  urgentBroadcastClaimedAt?: ISO8601;
  createdAt: ISO8601;
}
