import type { ID, ISO8601, Money } from "./common";

/**
 * Funnel identity slot. Persisted as a smallint, never as a hex string — the
 * user picks WHICH of the system's identities a funnel occupies, not a colour.
 * Slot 0 is the neutral one, reserved for the default triage funnel.
 */
export type FunnelAccent = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Lifecycle role of a stage inside its funnel. Retires CLOSING_STAGE_ID. */
export type LeadFunnelStageKind = "entrada" | "aberta" | "ganho" | "perda";

export interface ILeadFunnel {
  id: ID;
  storeId: ID;
  name: string;
  description?: string;
  accent: FunnelAccent;
  /** Iconify id. Mandatory: the icon, not the colour, carries the meaning. */
  icon: string;
  position: number;
  /** The store's triage funnel. Immutable in v1: unrestricted, unarchivable. */
  isDefault: boolean;
  /** Shortcut: every seller in the store reaches this funnel. */
  openToStore: boolean;
  /** Entry-stage count above which the column switches to triage mode. */
  entryAlertThreshold: number;
  archivedAt?: ISO8601;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

export interface ILeadFunnelStage {
  id: ID;
  funnelId: ID;
  /** Max 24 chars — longer names break the kanban column header. */
  name: string;
  accent: FunnelAccent;
  position: number;
  kind: LeadFunnelStageKind;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

/**
 * A lead's participation in one funnel. This — not the lead — owns the stage,
 * the outcome and the estimated value: a lead in two funnels is two distinct
 * opportunities, and counting the lead's single value twice would inflate the
 * forecast.
 */
export interface ILeadFunnelEntry {
  id: ID;
  leadId: ID;
  funnelId: ID;
  stageId: ID;
  storeId: ID;
  sellerId: ID | null;
  estimatedValue?: Money;
  convertedToCustomerId?: ID;
  lossReason?: string;
  lossNotes?: string;
  /** Real "days in stage", per funnel — not derived from the lead's updatedAt. */
  enteredStageAt: ISO8601;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

/** Per-stage aggregate for the column header. Computed server-side. */
export interface IFunnelBoardSummary {
  stageId: ID;
  count: number;
  sumValue: Money;
  overdueCount: number;
}
