/**
 * System health & observability domain (PRD-110).
 *
 * Read-only operational metrics surfaced on the Owner-only health dashboard
 * (`/app/gestao/saude`): the public healthcheck endpoint, the pg_cron job
 * roster and coarse database statistics.
 */

import type { ISO8601 } from "./common";

/** Aggregate verdict reported by the `health` Edge Function. */
export type SystemHealthStatus = "healthy" | "degraded" | "down" | "unknown";

/** Outcome of a single subsystem probe — intentionally opaque (no internals). */
export type SystemCheckResult = "ok" | "fail";

/** Snapshot returned by the public healthcheck endpoint (RF-020). */
export interface ISystemHealthcheck {
  status: SystemHealthStatus;
  checks: {
    db: SystemCheckResult;
    storage: SystemCheckResult;
    auth: SystemCheckResult;
  };
  /** When the probe ran (server clock when available, client clock otherwise). */
  checkedAt: ISO8601;
}

/** One pg_cron job with its most recent run (RF-031). */
export interface ISystemCronJob {
  jobName: string;
  /** Cron expression (e.g. every 15 minutes). */
  schedule: string;
  active: boolean;
  /** `succeeded` | `failed` | null when the job never ran. */
  lastRunStatus: string | null;
  lastRunStartedAt: ISO8601 | null;
  lastRunDurationMs: number | null;
}

/** Coarse database statistics (owner-only on the supabase source). */
export interface ISystemDbStats {
  dbSizeBytes: number;
  publicTablesCount: number;
  activeConnections: number;
  totalConnections: number;
}
