import type { ISystemCronJob, ISystemDbStats, ISystemHealthcheck } from "@/shared/types";
import type { ISystemHealthProvider } from "../../contracts/systemHealth";

/**
 * Mock implementation of {@link ISystemHealthProvider} (PRD-110).
 *
 * Self-contained synthetic data (no mock-store state): system health is pure
 * infrastructure telemetry with no domain entities behind it, so the usual
 * `@/mocks` API delegation would add a stateful layer for nothing. Always
 * healthy — the dashboard's "all green" rendering is what Fase 1 demos need.
 */

const MOCK_LATENCY_MS = 150;

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
}

const MOCK_DB_STATS: ISystemDbStats = {
  dbSizeBytes: 268_435_456, // 256 MiB
  publicTablesCount: 40,
  activeConnections: 7,
  totalConnections: 12,
};

export const mockSystemHealthProvider: ISystemHealthProvider = {
  async getHealthcheck(): Promise<ISystemHealthcheck> {
    await delay();
    return {
      status: "healthy",
      checks: { db: "ok", storage: "ok", auth: "ok" },
      checkedAt: new Date().toISOString(),
    };
  },

  async listCronJobs(): Promise<ISystemCronJob[]> {
    await delay();
    const now = Date.now();
    return [
      {
        jobName: "reconcile-derived-notifications",
        schedule: "* * * * *",
        active: true,
        lastRunStatus: "succeeded",
        lastRunStartedAt: new Date(now - 60_000).toISOString(),
        lastRunDurationMs: 320,
      },
      {
        jobName: "refresh-bi-matviews",
        schedule: "*/15 * * * *",
        active: true,
        lastRunStatus: "succeeded",
        lastRunStartedAt: new Date(now - 7 * 60_000).toISOString(),
        lastRunDurationMs: 1850,
      },
    ];
  },

  async getDbStats(): Promise<ISystemDbStats | null> {
    await delay();
    return MOCK_DB_STATS;
  },
};
