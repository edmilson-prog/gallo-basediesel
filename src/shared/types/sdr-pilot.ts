import type { ID, ISO8601 } from "./common";

/**
 * Operational, per-store settings for the real-production SDR pilot
 * (docs/superpowers/specs/2026-07-15-sdr-producao-parte-b-ativacao-design.md,
 * docs/superpowers/specs/2026-07-16-sdr-escalonamento-timeout-broadcast-design.md).
 * Model/provider/system-prompt for the "sdr" AI feature live in
 * `IAiSettings.routing` instead (aba Funcionalidades) — this type only
 * carries what's genuinely per-store and operational: the pilot kill-switch,
 * the backstop timeout, and the escalation-broadcast thresholds.
 */
export interface ISdrPilotSettings {
  storeId: ID;
  sdrEnabled: boolean;
  backstopTimeoutMinutes: number;
  /** Minutes an 'urgent'-mode escalation waits for a seller reply before broadcasting. */
  escalationTimeoutUrgentMinutes: number;
  /** Minutes a 'normal'- or 'standard'-mode escalation waits before broadcasting. */
  escalationTimeoutNormalMinutes: number;
  updatedAt: ISO8601;
  updatedBy: ID | null;
}
