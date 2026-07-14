import type { IWebhookDelivery, IWebhookDeliveryFilters } from "@/shared/types";
import type { IWebhookDeliveriesProvider } from "../../contracts/webhookDeliveries";

/**
 * Mock implementation of {@link IWebhookDeliveriesProvider}.
 *
 * Self-contained synthetic data (no mock-store state), same rationale as
 * `impl/mock/systemHealth.ts`: this is infrastructure telemetry with no
 * domain entity behind it. Reuses the same fake account ids as
 * `systemHealth.ts` ("wa-mock-matriz" / "wa-mock-filial") so the health
 * page's cards feel coherent together in mock mode.
 */

const MOCK_LATENCY_MS = 150;

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
}

const now = Date.now();

const MOCK_DELIVERIES: IWebhookDelivery[] = [
  {
    id: "whd-mock-1",
    integrationName: "whatsapp_meta",
    accountId: "wa-mock-matriz",
    eventType: "messages",
    endpoint: "/whatsapp-webhook/meta",
    httpStatus: 200,
    outcome: "processed",
    errorMessage: null,
    latencyMs: 210,
    requestPayload: { entry: [{ changes: [{ value: { messages: [{ type: "text" }] } }] }] },
    traceId: "trace-mock-1",
    createdAt: new Date(now - 2 * 60_000).toISOString(),
  },
  {
    id: "whd-mock-2",
    integrationName: "whatsapp_evolution",
    accountId: "wa-mock-filial",
    eventType: "messages.upsert",
    endpoint: "/whatsapp-webhook/evolution",
    httpStatus: 200,
    outcome: "duplicate",
    errorMessage: null,
    latencyMs: 45,
    requestPayload: { event: "messages.upsert", data: { key: { id: "3EB0MOCK" } } },
    traceId: "trace-mock-2",
    createdAt: new Date(now - 8 * 60_000).toISOString(),
  },
  {
    id: "whd-mock-3",
    integrationName: "whatsapp_waha",
    accountId: "wa-mock-filial",
    eventType: "message",
    endpoint: "/waha-webhook",
    httpStatus: 200,
    outcome: "ignored",
    errorMessage: null,
    latencyMs: 30,
    requestPayload: { event: "message", session: "mock-session", body: "" },
    traceId: null,
    createdAt: new Date(now - 20 * 60_000).toISOString(),
  },
  {
    id: "whd-mock-4",
    integrationName: "whatsapp_evolution_go",
    accountId: "wa-mock-matriz",
    eventType: "Message",
    endpoint: "/whatsapp-webhook/evolution-go",
    httpStatus: 200,
    outcome: "error",
    errorMessage: "customer insert failed: constraint violation",
    latencyMs: 512,
    requestPayload: { event: "Message", data: { Info: { IsFromMe: false } } },
    traceId: "trace-mock-4",
    createdAt: new Date(now - 45 * 60_000).toISOString(),
  },
  {
    id: "whd-mock-5",
    integrationName: "whatsapp_waha",
    accountId: null,
    eventType: null,
    endpoint: "/waha-webhook",
    httpStatus: 401,
    outcome: "rejected",
    errorMessage: "invalid signature",
    latencyMs: 12,
    requestPayload: { session: "unknown-session", event: "message" },
    traceId: null,
    createdAt: new Date(now - 90 * 60_000).toISOString(),
  },
];

export const mockWebhookDeliveriesProvider: IWebhookDeliveriesProvider = {
  async list(filters: IWebhookDeliveryFilters = {}): Promise<IWebhookDelivery[]> {
    await delay();
    let rows = MOCK_DELIVERIES.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    if (filters.accountId) rows = rows.filter((d) => d.accountId === filters.accountId);
    if (filters.outcome) rows = rows.filter((d) => d.outcome === filters.outcome);
    if (filters.fromDate) rows = rows.filter((d) => d.createdAt >= filters.fromDate!);
    if (filters.toDate) rows = rows.filter((d) => d.createdAt <= filters.toDate!);
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? rows.length;
    return rows.slice(offset, offset + limit);
  },
};
