import { describe, it, expect } from "vitest";
import { conversationActivityApi, conversationsApi } from "@/mocks";
import { upsert } from "@/mocks/store/mutations";
import { selectMessagesByConversation } from "@/mocks/store/selectors";
import type { IConversation, IConversationActivityEvent, IMessage } from "@/shared/types";
import { mockActivityProvider } from "./activity";

/**
 * Minimal, fully-specified conversation builder. Writes straight into the mock
 * store via `upsert` rather than the shared seed generator — the generator is
 * out of scope by ruling, and these fixtures exist only to exercise
 * `getCustomerTimeline`'s derivation.
 *
 * Cards are derived from CONVERSATIONS (mirroring the RPC's `conv` CTE), so a
 * conversation record is what every test here has to put on the table.
 */
function makeConversation(
  overrides: Partial<IConversation> & { id: string; customerId: string },
): IConversation {
  const conversation: IConversation = {
    storeId: "store-1",
    channel: "whatsapp",
    status: "aguardando",
    isSdrActive: false,
    tags: [],
    lastMessageAt: new Date(0).toISOString(),
    unreadCount: 0,
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
  upsert("conversations", conversation);
  return conversation;
}

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

  it("yields a card for a conversation that carries ZERO events", async () => {
    // The event-less conversation is the whole point of the feature: born before
    // the activity trigger existed, it has no event to be grouped by. The RPC
    // starts at `conversations` and left-joins activity, so it renders one; a
    // mock that grouped events would render none. This is that guarantee.
    const customerId = "cust-eventless";
    const conversation = makeConversation({
      id: "conv-eventless",
      customerId,
      createdAt: "2026-05-01T00:00:00.000Z",
    });

    const payload = await mockActivityProvider.getCustomerTimeline(customerId);

    expect(payload.conversations).toHaveLength(1);
    const card = payload.conversations[0]!;
    expect(card.id).toBe(conversation.id);
    expect(card.events).toEqual([]);
    // Born before the marker with no event at all — precisely the case the
    // "pré-registro" warning exists to explain.
    expect(card.preRegistro).toBe(true);
  });

  it("carries closedAt through from the conversation record", async () => {
    const customerId = "cust-closed";
    makeConversation({
      id: "conv-closed",
      customerId,
      status: "resolvida",
      createdAt: "2026-07-10T00:00:00.000Z",
      closedAt: "2026-07-10T02:00:00.000Z",
    });
    makeConversation({
      id: "conv-still-open",
      customerId,
      status: "em_andamento",
      createdAt: "2026-07-11T00:00:00.000Z",
    });

    const payload = await mockActivityProvider.getCustomerTimeline(customerId);
    const closed = payload.conversations.find((c) => c.id === "conv-closed")!;
    const open = payload.conversations.find((c) => c.id === "conv-still-open")!;

    expect(closed.closedAt).toBe("2026-07-10T02:00:00.000Z");
    // An open conversation reports null, never undefined — the engine's
    // durationMs check depends on it.
    expect(open.closedAt).toBeNull();
  });

  it("picks up the closedAt stamped when a conversation is actually closed", async () => {
    // End-to-end guard: without the stamp in conversationsApi.close, closedAt
    // would never be populated in mock mode and durationMs would stay null in
    // dev no matter what the user does.
    const customerId = "cust-close-flow";
    makeConversation({
      id: "conv-close-flow",
      customerId,
      status: "em_andamento",
      createdAt: "2026-07-12T00:00:00.000Z",
    });

    const before = await mockActivityProvider.getCustomerTimeline(customerId);
    expect(before.conversations[0]!.closedAt).toBeNull();

    await conversationsApi.close("conv-close-flow", "resolvida");

    const after = await mockActivityProvider.getCustomerTimeline(customerId);
    const card = after.conversations.find((c) => c.id === "conv-close-flow")!;
    expect(card.status).toBe("resolvida");
    expect(typeof card.closedAt).toBe("string");
    expect(Date.parse(card.closedAt!)).not.toBeNaN();
  });

  it("reads channel, status and assignedSellerId off the conversation record, matching the RPC", async () => {
    // The RPC reads conv.channel / conv.status / conv.assigned_seller_id
    // straight off the row. The mock does the same, rather than replaying the
    // event trail — the record is authoritative and is what production returns.
    const customerId = "cust-record";
    makeConversation({
      id: "conv-record",
      customerId,
      channel: "ecommerce",
      status: "em_andamento",
      assignedSellerId: "seller-owner-2",
      createdAt: "2026-07-20T00:00:00.000Z",
    });
    // A stale event trail that disagrees with the record must NOT win.
    await conversationActivityApi.create(
      makeEvent({
        conversationId: "conv-record",
        customerId,
        type: "created",
        toSellerId: "seller-original",
        conversationStatus: "aguardando",
        createdAt: "2026-07-20T00:00:01.000Z",
      }),
    );

    const payload = await mockActivityProvider.getCustomerTimeline(customerId);
    const card = payload.conversations.find((c) => c.id === "conv-record")!;

    expect(card.channel).toBe("ecommerce");
    expect(card.status).toBe("em_andamento");
    expect(card.assignedSellerId).toBe("seller-owner-2");
    expect(card.createdAt).toBe("2026-07-20T00:00:00.000Z");
  });

  it("reports assignedSellerId null when the conversation record has no owner", async () => {
    const customerId = "cust-unowned";
    makeConversation({ id: "conv-unowned", customerId, createdAt: "2026-07-21T00:00:00.000Z" });

    const payload = await mockActivityProvider.getCustomerTimeline(customerId);

    expect(payload.conversations[0]!.assignedSellerId).toBeNull();
  });

  it("gives each conversation only its own events, from an interleaved flat feed", async () => {
    const customerId = "cust-interleave";
    makeConversation({ id: "conv-a", customerId, createdAt: "2026-01-01T00:00:00.000Z" });
    makeConversation({ id: "conv-b", customerId, createdAt: "2026-01-01T00:00:00.500Z" });

    const a1 = makeEvent({
      conversationId: "conv-a",
      customerId,
      type: "created",
      createdAt: "2026-01-01T00:00:01.000Z",
    });
    const b1 = makeEvent({
      conversationId: "conv-b",
      customerId,
      type: "created",
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

  it("never conjures a card from an event whose conversation is not the customer's", async () => {
    // The RPC's events subquery is anchored to `conv.id`; an orphan event can
    // never produce a card of its own.
    const customerId = "cust-orphan-event";
    await conversationActivityApi.create(
      makeEvent({
        conversationId: "conv-never-stored",
        customerId,
        type: "created",
        createdAt: "2026-04-01T00:00:00.000Z",
      }),
    );

    const payload = await mockActivityProvider.getCustomerTimeline(customerId);

    expect(payload.conversations).toEqual([]);
  });

  it("derives messageCount and lastMessageAt from the real message store, not a hardcoded value", async () => {
    const customerId = "cust-messages";
    const conversationId = "conv-messages";
    makeConversation({ id: conversationId, customerId, createdAt: "2026-02-01T00:00:00.000Z" });

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
    makeConversation({
      id: "conv-before-marker",
      customerId,
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    makeConversation({
      id: "conv-after-marker",
      customerId,
      createdAt: "2026-07-10T00:00:00.000Z",
    });

    const payload = await mockActivityProvider.getCustomerTimeline(customerId);
    const convBefore = payload.conversations.find((c) => c.id === "conv-before-marker")!;
    const convAfter = payload.conversations.find((c) => c.id === "conv-after-marker")!;

    expect(convBefore.preRegistro).toBe(true);
    expect(convAfter.preRegistro).toBe(false);
  });

  it("truncates lastMessagePreview to 120 characters, matching the RPC's left(text, 120)", async () => {
    const customerId = "cust-long-preview";
    const conversationId = "conv-long-preview";
    makeConversation({ id: conversationId, customerId, createdAt: "2026-03-01T00:00:00.000Z" });

    const longText = "Peça disponível em estoque, ".repeat(10); // > 120 chars
    expect(longText.length).toBeGreaterThan(120);
    upsert("messages", makeMessage({ conversationId, text: longText }));

    const payload = await mockActivityProvider.getCustomerTimeline(customerId);
    const conv = payload.conversations.find((c) => c.id === conversationId)!;

    expect(conv.lastMessagePreview).toHaveLength(120);
    expect(conv.lastMessagePreview).toBe(longText.slice(0, 120));
  });
});
