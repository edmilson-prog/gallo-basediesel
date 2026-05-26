import type { ID, ISO8601 } from "./common";

/**
 * Operating mode for the routing engine.
 *
 *  - `automatic`: engine runs the cascade unattended and assigns a seller.
 *  - `manual`:    engine is paused — every new conversation lands on the queue
 *                 waiting for a Gestor/Owner to assign manually.
 *  - `sdr_first`: SDR handles every new conversation; humans escalate later
 *                 (handled by PRD-023).
 *  - `hybrid`:    real default — the carteira criterion always wins; the rest
 *                 of the cascade is delegated to the SDR.
 */
export type DistributionMode = "automatic" | "manual" | "sdr_first" | "hybrid";

/**
 * Criterion identifiers — one per cascade step.
 *
 * Order in `IDistributionSettings.criteriaOrder` controls execution order; the
 * engine stops at the first criterion that returns a match.
 */
export type DistributionCriterion =
  | "carteira"
  | "especialidade"
  | "round_robin"
  | "carga"
  | "fallback";

/**
 * Why the engine produced (or did not produce) a winner. Distinct from
 * `DistributionCriterion` because the fallback step branches into SDR vs. fila.
 */
export type DistributionMatchedCriterion =
  | "carteira"
  | "especialidade"
  | "round_robin"
  | "carga"
  | "fallback_sdr"
  | "fallback_fila";

/** Per-criterion toggle map. */
export interface IDistributionCriteriaEnabled {
  carteira: boolean;
  especialidade: boolean;
  round_robin: boolean;
  carga: boolean;
  /** Fallback is always conceptually active — exposed for symmetry only. */
  fallback: boolean;
}

/**
 * Weekly business-hours window.
 *
 * `weekday` follows JS `Date#getDay()` (0 = Sunday, 6 = Saturday).
 * `openAt` / `closeAt` are 24h strings, e.g. "08:00" / "18:00".
 * `enabled = false` keeps the row in the editor but skips the window.
 */
export interface IBusinessHoursWindow {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  openAt: string;
  closeAt: string;
  enabled: boolean;
}

/**
 * Aggregate distribution configuration kept inside `IPlatformSettings`.
 *
 * On the MVP every store carries a copy; on Fase 2 the Supabase row mirrors
 * the same shape so the engine ports unchanged.
 */
export interface IDistributionSettings {
  mode: DistributionMode;
  criteriaEnabled: IDistributionCriteriaEnabled;
  criteriaOrder: DistributionCriterion[];
  businessHours: IBusinessHoursWindow[];
  /** Message sent automatically by the SDR outside business hours. */
  offHoursMessage: string;
  /** How long a conversation may sit in the queue before alerting Owner. */
  queueTimeoutMinutes: number;
  /** Persistent cursor for the round-robin selector — never random. */
  lastAssignedSellerId: ID | null;
  /**
   * Keyword → matches the `especialidade` criterion when present in the first
   * customer message. On the MVP keywords are static; Fase 2 swaps for an LLM.
   */
  specialtyKeywords: string[];
}

/**
 * Audit-grade trace of a single distribution decision.
 *
 * Captures every candidate the engine evaluated — including discarded ones —
 * so Owner can answer "why did this conversation go to Carlos?" months later.
 */
export interface IDistributionTrace {
  id: ID;
  conversationId: ID;
  customerId?: ID;
  leadId?: ID;
  storeId: ID;
  timestamp: ISO8601;
  /** Winner of the cascade, or `null` when the result was SDR/fila. */
  selectedSellerId: ID | null;
  criterionMatched: DistributionMatchedCriterion;
  candidatesEvaluated: IDistributionCandidate[];
  /** Mode in effect when the decision was made — replay safety. */
  mode: DistributionMode;
}

/** One row of the `candidatesEvaluated` collection inside a trace. */
export interface IDistributionCandidate {
  sellerId: ID;
  /** Free-form motivation, e.g. "online, carga=4" or "offline — skipped". */
  reason: string;
  /** Did this candidate end up being selected? Convenience for the UI. */
  selected: boolean;
}
