import { describe, expect, it, vi } from "vitest";
import { messagesApi } from "./messages";
import { getMockState } from "../store/mockStore";
import { patchById } from "../store/mutations";
import { resetMockStorePerFile } from "@/mocks/test-setup";

resetMockStorePerFile();

describe("messagesApi.simulateIncoming", () => {
  it("reopens a resolvida conversation to aguardando, unassigns, and emits a reopen event", async () => {
    const seed = getMockState().conversations.find((c) => c.assignedSellerId);
    if (!seed) throw new Error("seed dataset has no assigned conversation to test against");
    const convId = seed.id;
    const unreadBefore = seed.unreadCount;
    patchById("conversations", convId, {
      status: "resolvida",
      assignedSellerId: seed.assignedSellerId,
    });
    const activityBefore = getMockState().conversationActivity.length;

    await messagesApi.simulateIncoming(convId);

    const updated = getMockState().conversations.find((c) => c.id === convId)!;
    expect(updated.status).toBe("aguardando");
    expect(updated.assignedSellerId).toBeUndefined();
    expect(updated.unreadCount).toBe(unreadBefore + 1);

    // `emitConversationActivity` dispatches fire-and-forget (mirrors audit-log
    // semantics) — the mock API's simulated latency means the store write lands
    // a beat after `simulateIncoming()` resolves.
    await vi.waitFor(() => {
      expect(getMockState().conversationActivity.length).toBe(activityBefore + 1);
    });
    const activityAfter = getMockState().conversationActivity;
    const event = activityAfter[activityAfter.length - 1]!;
    expect(event.type).toBe("reopen");
    expect(event.actorKind).toBe("system");
  });

  it("leaves an em_andamento conversation's owner untouched, requeues to aguardando, with no reopen event", async () => {
    const seed = getMockState().conversations.find((c) => c.assignedSellerId);
    if (!seed) throw new Error("seed dataset has no assigned conversation to test against");
    const convId = seed.id;
    patchById("conversations", convId, {
      status: "em_andamento",
      assignedSellerId: seed.assignedSellerId,
    });
    const activityBefore = getMockState().conversationActivity.length;

    await messagesApi.simulateIncoming(convId);

    const updated = getMockState().conversations.find((c) => c.id === convId)!;
    expect(updated.assignedSellerId).toBe(seed.assignedSellerId);
    expect(updated.status).toBe("aguardando");

    // No reopen ⇒ no emission. Wait past the mock API's simulated latency
    // window (LATENCY_MAX_MS=180ms) to be sure nothing lands late.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const activityAfter = getMockState().conversationActivity;
    expect(activityAfter.length).toBe(activityBefore);
  });
});
