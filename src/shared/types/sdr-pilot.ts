import type { ID, ISO8601 } from "./common";

/**
 * Operational, per-store settings for the real-production SDR pilot
 * (docs/superpowers/specs/2026-07-15-sdr-producao-parte-b-ativacao-design.md).
 * Model/provider/system-prompt for the "sdr" AI feature live in
 * `IAiSettings.routing` instead (aba Funcionalidades) — this type only
 * carries what's genuinely per-store and operational: the pilot kill-switch
 * and the backstop timeout.
 */
export interface ISdrPilotSettings {
  storeId: ID;
  sdrEnabled: boolean;
  backstopTimeoutMinutes: number;
  updatedAt: ISO8601;
  updatedBy: ID | null;
}
