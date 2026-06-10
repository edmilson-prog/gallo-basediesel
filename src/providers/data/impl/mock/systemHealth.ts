import type {
  ISystemCronJob,
  ISystemDbStats,
  ISystemHealthcheck,
  IWhatsAppDeliveryHealth,
} from "@/shared/types";
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

  async getWhatsAppDeliveryHealth(windowHours: number): Promise<IWhatsAppDeliveryHealth | null> {
    await delay();
    // Deterministic synthetic numbers; the 7d window scales the 24h baseline.
    const factor = windowHours >= 168 ? 7 : 1;
    return {
      windowHours,
      accounts: [
        {
          accountId: "wa-mock-matriz",
          label: "Matriz (Meta)",
          provider: "meta",
          total: 124 * factor,
          queued: 0,
          sent: 123 * factor,
          delivered: 119 * factor,
          read: 78 * factor,
          failed: 1 * factor,
        },
        {
          accountId: "wa-mock-filial",
          label: "Filial 1 (Evolution)",
          provider: "evolution",
          total: 36 * factor,
          queued: 0,
          sent: 36 * factor,
          delivered: 34 * factor,
          read: 0,
          failed: 0,
        },
      ],
      topFailures: [
        {
          failureCode: "131026",
          failureReason: "Número não é WhatsApp",
          count: 1 * factor,
        },
      ],
    };
  },
};
