import type { ISystemCronJob, ISystemDbStats, ISystemHealthcheck } from "@/shared/types";
import { getSupabaseClient } from "@/shared/lib/supabase";
import type { ISystemHealthProvider } from "../../contracts/systemHealth";

/**
 * Supabase implementation of {@link ISystemHealthProvider} (PRD-110).
 *
 * - `getHealthcheck` probes the public `health` Edge Function (verify_jwt off
 *   by design — RF-021) with a plain GET; network failures map to `unknown`
 *   so the dashboard distinguishes "endpoint said down" from "couldn't ask".
 * - `listCronJobs` / `getDbStats` call the owner-only `system_health_*` RPCs
 *   (SECURITY DEFINER, silent filter — non-owners get empty/null).
 */

const HEALTH_TIMEOUT_MS = 8000;

interface ICronJobRow {
  jobname: string;
  schedule: string;
  active: boolean;
  last_run_status: string | null;
  last_run_started_at: string | null;
  last_run_duration_ms: number | null;
}

interface IDbStatsRow {
  db_size_bytes: number;
  public_tables_count: number;
  active_connections: number;
  total_connections: number;
}

function healthEndpoint(): string {
  const base = import.meta.env.VITE_SUPABASE_URL ?? "";
  return `${base.replace(/\/$/, "")}/functions/v1/health`;
}

export const supabaseSystemHealthProvider: ISystemHealthProvider = {
  async getHealthcheck(): Promise<ISystemHealthcheck> {
    try {
      const res = await fetch(healthEndpoint(), {
        method: "GET",
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      const body = (await res.json()) as Partial<ISystemHealthcheck> & { ts?: string };
      return {
        status: body.status ?? "unknown",
        checks: {
          db: body.checks?.db ?? "fail",
          storage: body.checks?.storage ?? "fail",
          auth: body.checks?.auth ?? "fail",
        },
        checkedAt: body.ts ?? new Date().toISOString(),
      };
    } catch {
      // Couldn't reach the endpoint at all — distinct from a reported "down".
      return {
        status: "unknown",
        checks: { db: "fail", storage: "fail", auth: "fail" },
        checkedAt: new Date().toISOString(),
      };
    }
  },

  async listCronJobs(): Promise<ISystemCronJob[]> {
    const { data, error } = await getSupabaseClient().rpc("system_health_cron_jobs");
    if (error) throw new Error(`system_health_cron_jobs: ${error.message}`);
    return ((data ?? []) as ICronJobRow[]).map((row) => ({
      jobName: row.jobname,
      schedule: row.schedule,
      active: row.active,
      lastRunStatus: row.last_run_status,
      lastRunStartedAt: row.last_run_started_at,
      lastRunDurationMs: row.last_run_duration_ms,
    }));
  },

  async getDbStats(): Promise<ISystemDbStats | null> {
    const { data, error } = await getSupabaseClient().rpc("system_health_db_stats");
    if (error) throw new Error(`system_health_db_stats: ${error.message}`);
    if (!data) return null;
    const row = data as IDbStatsRow;
    return {
      dbSizeBytes: row.db_size_bytes,
      publicTablesCount: row.public_tables_count,
      activeConnections: row.active_connections,
      totalConnections: row.total_connections,
    };
  },
};
