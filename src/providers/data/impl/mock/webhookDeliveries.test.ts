import { describe, expect, it } from "vitest";
import { mockWebhookDeliveriesProvider } from "./webhookDeliveries";

describe("mockWebhookDeliveriesProvider", () => {
  it("returns deliveries covering every outcome", async () => {
    const list = await mockWebhookDeliveriesProvider.list();
    const outcomes = new Set(list.map((d) => d.outcome));
    expect(outcomes).toEqual(new Set(["processed", "ignored", "duplicate", "error", "rejected"]));
  });

  it("filters by accountId", async () => {
    const all = await mockWebhookDeliveriesProvider.list();
    const target = all.find((d) => d.accountId !== null);
    expect(target).toBeDefined();
    const filtered = await mockWebhookDeliveriesProvider.list({ accountId: target!.accountId! });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((d) => d.accountId === target!.accountId)).toBe(true);
  });

  it("filters by outcome", async () => {
    const filtered = await mockWebhookDeliveriesProvider.list({ outcome: "rejected" });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((d) => d.outcome === "rejected")).toBe(true);
  });

  it("respects limit", async () => {
    const limited = await mockWebhookDeliveriesProvider.list({ limit: 2 });
    expect(limited).toHaveLength(2);
  });
});
