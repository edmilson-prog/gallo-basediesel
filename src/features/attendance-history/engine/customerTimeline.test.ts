import { describe, it, expect } from "vitest";
import type { ICustomerTimelinePayload } from "@/shared/types";
import { buildCustomerTimeline } from "./customerTimeline";

const conversation = (over: Partial<ICustomerTimelinePayload["conversations"][number]> = {}) => ({
  id: "c1",
  channel: "whatsapp" as const,
  status: "resolvida" as const,
  createdAt: "2026-08-12T09:00:00Z",
  closedAt: "2026-08-14T17:02:00Z",
  assignedSellerId: "s1",
  preRegistro: false,
  messageCount: 18,
  lastMessageAt: "2026-08-13T10:00:00Z",
  lastMessagePreview: "combinado",
  events: [
    {
      id: "e1",
      conversationId: "c1",
      storeId: "st1",
      type: "assignment" as const,
      toSellerId: "s1",
      actorKind: "seller" as const,
      actorId: "s1",
      createdAt: "2026-08-12T09:31:00Z",
      conversationChannel: "whatsapp" as const,
      conversationStatus: "resolvida" as const,
      conversationCreatedAt: "2026-08-12T09:00:00Z",
    },
  ],
  notes: [{ id: "n1", at: "2026-08-12T11:00:00Z", authorId: "s1", body: "pediu prazo" }],
  quotes: [],
  orders: [],
  ...over,
});

const payload = (convs: ReturnType<typeof conversation>[]): ICustomerTimelinePayload => ({
  customerId: "cu1",
  generatedAt: "2026-08-18T13:00:00Z",
  conversations: convs,
});

describe("buildCustomerTimeline", () => {
  it("merges every source into one trail ordered newest-first", () => {
    const [card] = buildCustomerTimeline(payload([conversation()]), "tudo");
    expect(card.items.map((i) => i.kind)).toEqual(["conversa", "nota", "historico"]);
    expect(card.items[0].at).toBe("2026-08-13T10:00:00Z");
  });

  it("aggregates messages into a single item, never one per message", () => {
    const [card] = buildCustomerTimeline(payload([conversation({ messageCount: 240 })]), "tudo");
    const messageItems = card.items.filter((i) => i.kind === "conversa");
    expect(messageItems).toHaveLength(1);
    expect(messageItems[0].messageCount).toBe(240);
  });

  it("omits the message item when the conversation has none", () => {
    const [card] = buildCustomerTimeline(
      payload([conversation({ messageCount: 0, lastMessageAt: null })]),
      "tudo",
    );
    expect(card.items.some((i) => i.kind === "conversa")).toBe(false);
  });

  it("keeps the card when the filter empties it", () => {
    const [card] = buildCustomerTimeline(
      payload([conversation({ notes: [], events: [] })]),
      "nota",
    );
    expect(card).toBeDefined();
    expect(card.items).toHaveLength(0);
  });

  it("collapses a pre-registro conversation that has no event at all", () => {
    const [card] = buildCustomerTimeline(
      payload([conversation({ preRegistro: true, events: [], notes: [] })]),
      "tudo",
    );
    expect(card.preRegistro).toBe(true);
    expect(card.collapsed).toBe(true);
  });

  it("does NOT collapse a pre-registro conversation that has partial events", () => {
    const [card] = buildCustomerTimeline(payload([conversation({ preRegistro: true })]), "tudo");
    expect(card.preRegistro).toBe(true);
    expect(card.collapsed).toBe(false);
  });

  it("summarises duration and owner", () => {
    const [card] = buildCustomerTimeline(payload([conversation()]), "tudo");
    expect(card.summary.ownerId).toBe("s1");
    expect(card.summary.durationMs).toBe(
      Date.parse("2026-08-14T17:02:00Z") - Date.parse("2026-08-12T09:00:00Z"),
    );
  });

  it("survives an empty payload", () => {
    expect(buildCustomerTimeline(payload([]), "tudo")).toEqual([]);
  });

  it("orders cards newest-first regardless of the input order", () => {
    const older = conversation({
      id: "c-older",
      createdAt: "2026-08-10T09:00:00Z",
      closedAt: "2026-08-10T10:00:00Z",
    });
    const newer = conversation({
      id: "c-newer",
      createdAt: "2026-08-15T09:00:00Z",
      closedAt: "2026-08-15T10:00:00Z",
    });
    // Passed in ascending (oldest-first) order — the provider/RPC order is
    // not guaranteed, so the engine must sort regardless of input order.
    const cards = buildCustomerTimeline(payload([older, newer]), "tudo");
    expect(cards.map((c) => c.conversationId)).toEqual(["c-newer", "c-older"]);
  });
});
