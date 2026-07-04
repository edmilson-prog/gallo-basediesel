import { describe, expect, it, vi } from "vitest";
import { conversationsApi } from "./conversations";
import { getMockState } from "../store/mockStore";
import { resetMockStorePerFile } from "@/mocks/test-setup";

resetMockStorePerFile();

describe("conversationsApi.update", () => {
  it("emits exactly one status activity event when status changes", async () => {
    const seed = getMockState().conversations.find((c) => c.status === "em_andamento");
    if (!seed) throw new Error("seed dataset has no em_andamento conversation to test against");
    const convId = seed.id;
    const activityBefore = getMockState().conversationActivity.length;

    const updated = await conversationsApi.update(convId, { status: "aguardando_cliente" });

    expect(updated.status).toBe("aguardando_cliente");

    // `emitConversationActivity` dispatches fire-and-forget — the mock API's
    // simulated latency means the store write lands a beat after `update()`
    // resolves (mirrors `conversations.close.test.ts`).
    await vi.waitFor(() => {
      expect(getMockState().conversationActivity.length).toBe(activityBefore + 1);
    });
    const activityAfter = getMockState().conversationActivity;
    const event = activityAfter[activityAfter.length - 1]!;
    expect(event.conversationId).toBe(convId);
    expect(event.type).toBe("status");
    expect(event.toStatus).toBe("aguardando_cliente");
  });

  it("emits no activity event for an update with no status/owner delta", async () => {
    const seed = getMockState().conversations[0];
    if (!seed) throw new Error("seed dataset is empty");
    const convId = seed.id;
    const activityBefore = getMockState().conversationActivity.length;

    await conversationsApi.update(convId, { tags: [...(seed.tags ?? []), "vip"] });

    // Give the fire-and-forget dispatch a chance to land, then assert no growth.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getMockState().conversationActivity.length).toBe(activityBefore);
  });

  it("emits no activity event for a no-op update (same status/owner)", async () => {
    const seed = getMockState().conversations.find((c) => c.assignedSellerId);
    if (!seed) throw new Error("seed dataset has no assigned conversation to test against");
    const convId = seed.id;
    const activityBefore = getMockState().conversationActivity.length;

    await conversationsApi.update(convId, {
      status: seed.status,
      assignedSellerId: seed.assignedSellerId,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(getMockState().conversationActivity.length).toBe(activityBefore);
  });
});
