import { describe, it, expect } from "vitest";
import { conversationActivityApi } from "@/mocks";
import { upsert } from "@/mocks/store/mutations";
import { selectMessagesByConversation } from "@/mocks/store/selectors";
import type { IConversationActivityEvent, IMessage } from "@/shared/types";
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

/**
 * Minimal, fully-specified message builder. Writes straight into the mock
 * store via `upsert` (the same mutation `messagesApi.send` uses under the
 * hood) rather than the shared seed generator — these fixtures exist only to
 * exercise `getCustomerTimeline`'s derivation, not to grow the seed dataset.
 */
function makeMessage(overrides: Partial<IMessage> & { conversationId: string }): IMessage {
  return {
    id: crypto.randomUUID(),
    direction: "in",
    authorType: "customer",
    provider: "mock",
    text: "",
    status: "delivered",
    sentAt: new Date(0).toISOString(),
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

  it("derives messageCount and lastMessageAt from the real message store, not a hardcoded value", async () => {
    const customerId = "cust-messages";
    const conversationId = "conv-messages";
    await conversationActivityApi.create(
      makeEvent({
        conversationId,
        customerId,
        type: "created",
        createdAt: "2026-02-01T00:00:00.000Z",
        conversationCreatedAt: "2026-02-01T00:00:00.000Z",
      }),
    );

    const m1 = makeMessage({ conversationId, text: "oi", sentAt: "2026-02-01T00:05:00.000Z" });
    const m2 = makeMessage({
      conversationId,
      text: "tudo bem?",
      sentAt: "2026-02-01T00:10:00.000Z",
    });
    const m3 = makeMessage({
      conversationId,
      text: "combinado",
      sentAt: "2026-02-01T00:15:00.000Z",
    });
    upsert("messages", m1);
    upsert("messages", m2);
    upsert("messages", m3);

    // Read the expected count from the same accessor the provider itself
    // uses, so this isn't a hardcoded number disconnected from the real
    // source — it's a genuine cross-check against the mock's message store.
    const expectedCount = selectMessagesByConversation(conversationId).length;
    expect(expectedCount).toBe(3);

    const payload = await mockActivityProvider.getCustomerTimeline(customerId);
    const conv = payload.conversations.find((c) => c.id === conversationId)!;

    expect(conv.messageCount).toBe(expectedCount);
    expect(conv.lastMessageAt).toBe(m3.sentAt);
    expect(conv.lastMessagePreview).toBe("combinado");
  });

  it("flags preRegistro true for a conversation created before the marker, false for one after", async () => {
    const customerId = "cust-pre-registro";
    // 2026-07-04T01:43:17Z is the exact cutover instant the RPC backfill
    // uses (supabase/migrations/20260818120000_get_customer_timeline.sql and
    // .../20260818122000_backfill_pre_registro.sql). The seed dataset has no
    // conversation before it (daysAgo(30, now) never reaches back that far),
    // so this fixture is constructed explicitly rather than relying on seed
    // data — per the ruling, the shared generator is out of scope to change.
    const before = makeEvent({
      conversationId: "conv-before-marker",
      customerId,
      type: "created",
      createdAt: "2026-07-01T00:00:00.000Z",
      conversationCreatedAt: "2026-07-01T00:00:00.000Z",
    });
    const after = makeEvent({
      conversationId: "conv-after-marker",
      customerId,
      type: "created",
      createdAt: "2026-07-10T00:00:00.000Z",
      conversationCreatedAt: "2026-07-10T00:00:00.000Z",
    });
    await conversationActivityApi.create(before);
    await conversationActivityApi.create(after);

    const payload = await mockActivityProvider.getCustomerTimeline(customerId);
    const convBefore = payload.conversations.find((c) => c.id === "conv-before-marker")!;
    const convAfter = payload.conversations.find((c) => c.id === "conv-after-marker")!;

    expect(convBefore.preRegistro).toBe(true);
    expect(convAfter.preRegistro).toBe(false);
  });

  it("truncates lastMessagePreview to 120 characters, matching the RPC's left(text, 120)", async () => {
    const customerId = "cust-long-preview";
    const conversationId = "conv-long-preview";
    await conversationActivityApi.create(
      makeEvent({
        conversationId,
        customerId,
        type: "created",
        createdAt: "2026-03-01T00:00:00.000Z",
        conversationCreatedAt: "2026-03-01T00:00:00.000Z",
      }),
    );

    const longText = "Peça disponível em estoque, ".repeat(10); // > 120 chars
    expect(longText.length).toBeGreaterThan(120);
    upsert("messages", makeMessage({ conversationId, text: longText }));

    const payload = await mockActivityProvider.getCustomerTimeline(customerId);
    const conv = payload.conversations.find((c) => c.id === conversationId)!;

    expect(conv.lastMessagePreview).toHaveLength(120);
    expect(conv.lastMessagePreview).toBe(longText.slice(0, 120));
  });
});
