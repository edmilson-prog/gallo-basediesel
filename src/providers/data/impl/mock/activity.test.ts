import { describe, it, expect } from "vitest";
import { conversationActivityApi } from "@/mocks";
import type { IConversationActivityEvent } from "@/shared/types";
import { mockActivityProvider } from "./activity";

/** Minimal, fully-specified event builder so each test only overrides what it cares about. */
function makeEvent(overrides: Partial<IConversationActivityEvent>): IConversationActivityEvent {
  return {
    id: crypto.randomUUID(),
    conversationId: "conv-default",
    customerId: "cust-default",
    storeId: "store-1",
    type: "status",
    fromStatus: null,
    toStatus: null,
    fromSellerId: null,
    toSellerId: null,
    actorId: null,
    actorKind: "system",
    createdAt: new Date(0).toISOString(),
    conversationChannel: "whatsapp",
    conversationStatus: "aguardando",
    conversationCreatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe("mockActivityProvider.getCustomerTimeline", () => {
  it("returns a well-formed payload for an unknown customer", async () => {
    const payload = await mockActivityProvider.getCustomerTimeline("does-not-exist");
    expect(payload.customerId).toBe("does-not-exist");
    expect(payload.conversations).toEqual([]);
    expect(typeof payload.generatedAt).toBe("string");
  });

  it("groups an interleaved flat feed into one entry per conversation, each holding only its own events", async () => {
    const customerId = "cust-interleave";
    const a1 = makeEvent({
      conversationId: "conv-a",
      customerId,
      type: "created",
      toSellerId: "seller-a",
      createdAt: "2026-01-01T00:00:01.000Z",
    });
    const b1 = makeEvent({
      conversationId: "conv-b",
      customerId,
      type: "created",
      toSellerId: "seller-b",
      createdAt: "2026-01-01T00:00:02.000Z",
    });
    const a2 = makeEvent({
      conversationId: "conv-a",
      customerId,
      type: "status",
      toStatus: "resolvida",
      createdAt: "2026-01-01T00:00:03.000Z",
    });
    const b2 = makeEvent({
      conversationId: "conv-b",
      customerId,
      type: "status",
      toStatus: "resolvida",
      createdAt: "2026-01-01T00:00:04.000Z",
    });
    // Create out of chronological order to prove grouping doesn't depend on insertion order.
    await conversationActivityApi.create(b1);
    await conversationActivityApi.create(a1);
    await conversationActivityApi.create(b2);
    await conversationActivityApi.create(a2);

    const payload = await mockActivityProvider.getCustomerTimeline(customerId);

    expect(payload.conversations).toHaveLength(2);
    const conv = (id: string) => payload.conversations.find((c) => c.id === id);
    expect(conv("conv-a")?.events.map((e) => e.id)).toEqual([a1.id, a2.id]);
    expect(conv("conv-b")?.events.map((e) => e.id)).toEqual([b1.id, b2.id]);
  });

  it("reports the last owner-bearing event's seller, not a trailing collaborator, as assignedSellerId", async () => {
    const customerId = "cust-participant";
    const created = makeEvent({
      conversationId: "conv-p",
      customerId,
      type: "created",
      toSellerId: "seller-owner",
      createdAt: "2026-01-02T00:00:01.000Z",
    });
    // A real reassignment, typed `status` because the trigger also flips the status in the
    // same UPDATE — this must still win over the earlier `created` owner.
    const statusReassignment = makeEvent({
      conversationId: "conv-p",
      customerId,
      type: "status",
      toStatus: "em_andamento",
      toSellerId: "seller-owner-2",
      createdAt: "2026-01-02T00:00:02.000Z",
    });
    const participantAdd = makeEvent({
      conversationId: "conv-p",
      customerId,
      type: "participant_add",
      toSellerId: "seller-collaborator",
      createdAt: "2026-01-02T00:00:03.000Z",
    });
    await conversationActivityApi.create(created);
    await conversationActivityApi.create(statusReassignment);
    await conversationActivityApi.create(participantAdd);

    const payload = await mockActivityProvider.getCustomerTimeline(customerId);

    expect(payload.conversations).toHaveLength(1);
    expect(payload.conversations[0]!.assignedSellerId).toBe("seller-owner-2");
  });

  it("treats a status-typed event's toSellerId as a real ownership change (trigger types status+owner changes as `status`)", async () => {
    const customerId = "cust-status-owner";
    const created = makeEvent({
      conversationId: "conv-so",
      customerId,
      type: "created",
      toSellerId: "seller-original",
      createdAt: "2026-01-04T00:00:01.000Z",
    });
    // Taking over a conversation changes status AND owner in the same UPDATE, so the trigger
    // types this `status`, not `assignment` — this is the dominant case in production.
    const statusTypedOwnerChange = makeEvent({
      conversationId: "conv-so",
      customerId,
      type: "status",
      fromStatus: "aguardando",
      toStatus: "em_andamento",
      toSellerId: "seller-new",
      createdAt: "2026-01-04T00:00:02.000Z",
    });
    await conversationActivityApi.create(created);
    await conversationActivityApi.create(statusTypedOwnerChange);

    const payload = await mockActivityProvider.getCustomerTimeline(customerId);

    expect(payload.conversations).toHaveLength(1);
    expect(payload.conversations[0]!.assignedSellerId).toBe("seller-new");
  });

  it("reports the latest status, not the status at conversation creation", async () => {
    const customerId = "cust-status-change";
    const created = makeEvent({
      conversationId: "conv-s",
      customerId,
      type: "created",
      conversationStatus: "aguardando",
      createdAt: "2026-01-03T00:00:01.000Z",
    });
    const statusChange = makeEvent({
      conversationId: "conv-s",
      customerId,
      type: "status",
      fromStatus: "aguardando",
      toStatus: "resolvida",
      conversationStatus: "resolvida",
      createdAt: "2026-01-03T00:00:02.000Z",
    });
    await conversationActivityApi.create(created);
    await conversationActivityApi.create(statusChange);

    const payload = await mockActivityProvider.getCustomerTimeline(customerId);

    expect(payload.conversations).toHaveLength(1);
    expect(payload.conversations[0]!.status).toBe("resolvida");
  });
});
