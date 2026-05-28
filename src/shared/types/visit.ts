import type { ID, ISO8601 } from "./common";

/** Status of a field visit scheduled by an external seller (PRD-070). */
export type VisitStatus = "agendada" | "realizada" | "cancelada" | "remarcada";

/**
 * Field visit scheduled by an external seller to a customer (PRD-070 RF-017).
 *
 * Lightweight model introduced for the external-seller PWA skeleton. Offline
 * sync and richer fields (location capture, signature) are Fase 2 concerns.
 */
export interface IVisit {
  id: ID;
  customerId: ID;
  sellerId: ID;
  /** When the visit is scheduled to happen. */
  scheduledAt: ISO8601;
  /** Free-text address — defaults from the customer when omitted. */
  address?: string;
  notes?: string;
  status: VisitStatus;
  createdAt: ISO8601;
}
