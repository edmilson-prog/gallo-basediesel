import type {
  ISystemCronJob,
  ISystemDbStats,
  ISystemHealthcheck,
  IWhatsAppDeliveryHealth,
  IWhatsAppProviderHealthAccount,
} from "@/shared/types";

/**
 * Read-only provider behind the Owner-only system health dashboard
 * (PRD-110, `/app/gestao/saude`).
 *
 * - `mock` source: deterministic synthetic data (always healthy) so the
 *   dashboard renders meaningfully in Fase 1 demos.
 * - `supabase` source: the public `health` Edge Function plus the owner-only
 *   `system_health_*` RPCs (non-owners get empty/null from the database).
 */
export interface ISystemHealthProvider {
  /** Probes the live healthcheck endpoint. Never throws — failures map to `down`/`unknown`. */
  getHealthcheck(): Promise<ISystemHealthcheck>;
  /** pg_cron job roster with each job's latest run. Empty for non-owners. */
  listCronJobs(): Promise<ISystemCronJob[]>;
  /** Coarse database statistics. `null` for non-owners (silent filter). */
  getDbStats(): Promise<ISystemDbStats | null>;
  /**
   * WhatsApp outbound delivery aggregates over the last `windowHours`
   * (PRD-118). `null` for non-owners (silent filter).
   */
  getWhatsAppDeliveryHealth(windowHours: number): Promise<IWhatsAppDeliveryHealth | null>;
  /**
   * Per-account provider health + failover posture (PRD-120).
   * `null` for non-owners (silent filter).
   */
  getWhatsAppProviderHealth(): Promise<IWhatsAppProviderHealthAccount[] | null>;
}
