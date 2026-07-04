import { describe, expect, it, vi } from "vitest";
import { conversationsApi } from "./conversations";
import { getMockState } from "../store/mockStore";
import { patchById } from "../store/mutations";
import { resetMockStorePerFile } from "@/mocks/test-setup";

resetMockStorePerFile();

describe("conversationsApi.close", () => {
  it("resolves + unassigns + emits a status activity event", async () => {
    const seed = getMockState().conversations.find((c) => c.assignedSellerId);
    if (!seed) throw new Error("seed dataset has no assigned conversation to test against");
    const convId = seed.id;
    patchById("conversations", convId, {
      status: "em_andamento",
      assignedSellerId: seed.assignedSellerId,
      isSdrActive: false,
    });
    const activityBefore = getMockState().conversationActivity.length;

    const updated = await conversationsApi.close(convId, "resolvida");

    expect(updated.status).toBe("resolvida");
    expect(updated.assignedSellerId).toBeUndefined();
    expect(updated.isSdrActive).toBe(false);

    // `emitConversationActivity` dispatches fire-and-forget (mirrors audit-log
    // semantics) — the mock API's simulated latency means the store write lands
    // a beat after `close()` resolves.
    await vi.waitFor(() => {
      expect(getMockState().conversationActivity.length).toBe(activityBefore + 1);
    });
    const activityAfter = getMockState().conversationActivity;
    const event = activityAfter[activityAfter.length - 1]!;
    expect(event.conversationId).toBe(convId);
    expect(event.type).toBe("status");
    expect(event.toStatus).toBe("resolvida");
    expect(event.toSellerId).toBeNull();
  });
});
