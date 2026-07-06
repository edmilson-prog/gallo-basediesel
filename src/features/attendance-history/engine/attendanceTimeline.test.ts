import { describe, expect, it } from "vitest";
import type { IConversationActivityEvent } from "@/shared/types";
import { buildAttendanceTimeline } from "./attendanceTimeline";

function event(overrides: Partial<IConversationActivityEvent>): IConversationActivityEvent {
  return {
    id: "evt-1",
    conversationId: "conv-1",
    customerId: "cust-1",
    storeId: "store-1",
    type: "created",
    fromStatus: null,
    toStatus: "aguardando",
    fromSellerId: null,
    toSellerId: null,
    actorId: null,
    actorKind: "system",
    createdAt: "2026-07-01T10:00:00.000Z",
    conversationChannel: "whatsapp",
    conversationStatus: "aguardando",
    conversationCreatedAt: "2026-07-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("buildAttendanceTimeline", () => {
  it("groups events by conversationId, one group per conversation", () => {
    const events = [
      event({ id: "e1", conversationId: "conv-1", createdAt: "2026-07-01T10:00:00.000Z" }),
      event({ id: "e2", conversationId: "conv-2", createdAt: "2026-07-01T11:00:00.000Z" }),
    ];
    const timeline = buildAttendanceTimeline(events);
    expect(timeline).toHaveLength(2);
    expect(timeline.map((t) => t.conversationId).sort()).toEqual(["conv-1", "conv-2"]);
  });

  it("sorts conversations by most-recent activity desc", () => {
    const events = [
      event({ id: "e1", conversationId: "conv-1", createdAt: "2026-07-01T10:00:00.000Z" }),
      event({ id: "e2", conversationId: "conv-2", createdAt: "2026-07-01T12:00:00.000Z" }),
      event({ id: "e3", conversationId: "conv-1", createdAt: "2026-07-01T11:00:00.000Z" }),
    ];
    const timeline = buildAttendanceTimeline(events);
    expect(timeline.map((t) => t.conversationId)).toEqual(["conv-2", "conv-1"]);
  });

  it("sorts nodes within a group by createdAt asc", () => {
    const events = [
      event({ id: "e1", conversationId: "conv-1", createdAt: "2026-07-01T12:00:00.000Z" }),
      event({ id: "e2", conversationId: "conv-1", createdAt: "2026-07-01T10:00:00.000Z" }),
      event({ id: "e3", conversationId: "conv-1", createdAt: "2026-07-01T11:00:00.000Z" }),
    ];
    const timeline = buildAttendanceTimeline(events);
    expect(timeline[0]!.nodes.map((n) => n.event.id)).toEqual(["e2", "e3", "e1"]);
  });

  it("participant add/remove never move the conversation's final owner", () => {
    // Owner acquired by seller A; a collaborator (seller B) joins then leaves.
    // A collaborator is NOT the assignee, so B must never become finalSellerId.
    const events = [
      event({ id: "e1", type: "created", toSellerId: "seller-A", createdAt: "2026-07-01T10:00:00.000Z" }),
      event({ id: "e2", type: "assignment", fromSellerId: null, toSellerId: "seller-A", actorId: "seller-A", actorKind: "seller", createdAt: "2026-07-01T10:05:00.000Z" }),
      event({ id: "e3", type: "participant_add", toSellerId: "seller-B", actorId: "seller-A", actorKind: "seller", createdAt: "2026-07-01T10:10:00.000Z" }),
      event({ id: "e4", type: "participant_remove", toSellerId: "seller-B", actorId: "seller-B", actorKind: "seller", createdAt: "2026-07-01T10:20:00.000Z" }),
    ];
    const summary = buildAttendanceTimeline(events)[0]!.summary;
    expect(summary.finalSellerId).toBe("seller-A");
    expect(summary.transferCount).toBe(0);
    expect(summary.eventCount).toBe(4);
  });

  it("computes duration to next node in the same conversation; last node has null duration", () => {
    const events = [
      event({ id: "e1", conversationId: "conv-1", createdAt: "2026-07-01T10:00:00.000Z" }),
      event({ id: "e2", conversationId: "conv-1", createdAt: "2026-07-01T11:30:00.000Z" }),
      event({ id: "e3", conversationId: "conv-1", createdAt: "2026-07-01T12:00:00.000Z" }),
    ];
    const timeline = buildAttendanceTimeline(events);
    const [n1, n2, n3] = timeline[0]!.nodes;
    if (!n1 || !n2 || !n3) throw new Error("expected 3 nodes");
    expect(n1.durationMs).toBe(90 * 60_000);
    expect(n2.durationMs).toBe(30 * 60_000);
    expect(n3.durationMs).toBeNull();
  });

  it("summary.transferCount counts genuine reassignments only, excluding the initial self-assign", () => {
    const events = [
      event({ id: "e1", conversationId: "conv-1", type: "created", createdAt: "2026-07-01T10:00:00.000Z" }),
      event({
        id: "e2",
        conversationId: "conv-1",
        type: "assignment",
        toSellerId: "seller-1",
        createdAt: "2026-07-01T11:00:00.000Z",
      }),
      event({
        id: "e3",
        conversationId: "conv-1",
        type: "assignment",
        toSellerId: null,
        createdAt: "2026-07-01T12:00:00.000Z",
      }),
      event({
        id: "e4",
        conversationId: "conv-1",
        type: "assignment",
        toSellerId: "seller-2",
        createdAt: "2026-07-01T13:00:00.000Z",
      }),
    ];
    const timeline = buildAttendanceTimeline(events);
    // e2 is the first owner acquisition (not a transfer); only e4 hands the
    // conversation off from a prior owner.
    expect(timeline[0]!.summary.transferCount).toBe(1);
    expect(timeline[0]!.summary.eventCount).toBe(4);
  });

  it("summary.finalSellerId is the last toSellerId seen", () => {
    const events = [
      event({
        id: "e1",
        conversationId: "conv-1",
        type: "assignment",
        toSellerId: "seller-1",
        createdAt: "2026-07-01T10:00:00.000Z",
      }),
      event({
        id: "e2",
        conversationId: "conv-1",
        type: "assignment",
        toSellerId: "seller-2",
        createdAt: "2026-07-01T11:00:00.000Z",
      }),
    ];
    const timeline = buildAttendanceTimeline(events);
    expect(timeline[0]!.summary.finalSellerId).toBe("seller-2");
  });

  it("summary.finalSellerId is null when the conversation ended without an owner (closed)", () => {
    const events = [
      event({
        id: "e1",
        conversationId: "conv-1",
        type: "assignment",
        toSellerId: "seller-1",
        createdAt: "2026-07-01T10:00:00.000Z",
      }),
      event({
        id: "e2",
        conversationId: "conv-1",
        type: "assignment",
        fromSellerId: "seller-1",
        toSellerId: null,
        createdAt: "2026-07-01T11:00:00.000Z",
      }),
    ];
    const timeline = buildAttendanceTimeline(events);
    expect(timeline[0]!.summary.finalSellerId).toBeNull();
  });

  it("summary.finalSellerId is null when a CLOSE carries the owner drop on a 'status' row", () => {
    const events = [
      event({
        id: "e1",
        conversationId: "conv-1",
        type: "assignment",
        fromSellerId: null,
        toSellerId: "seller-1",
        createdAt: "2026-07-01T10:00:00.000Z",
      }),
      event({
        id: "e2",
        conversationId: "conv-1",
        type: "status",
        fromStatus: "aguardando",
        toStatus: "resolvida",
        fromSellerId: "seller-1",
        toSellerId: null,
        createdAt: "2026-07-01T11:00:00.000Z",
      }),
    ];
    const timeline = buildAttendanceTimeline(events);
    expect(timeline[0]!.summary.finalSellerId).toBeNull();
  });

  it("summary.totalDurationMs sums the span from the first to the last node", () => {
    const events = [
      event({ id: "e1", conversationId: "conv-1", createdAt: "2026-07-01T10:00:00.000Z" }),
      event({ id: "e2", conversationId: "conv-1", createdAt: "2026-07-01T11:00:00.000Z" }),
      event({ id: "e3", conversationId: "conv-1", createdAt: "2026-07-01T12:30:00.000Z" }),
    ];
    const timeline = buildAttendanceTimeline(events);
    expect(timeline[0]!.summary.totalDurationMs).toBe(150 * 60_000);
  });

  it("carries currentStatus, channel, and createdAt from the denormalized fields of the group", () => {
    const events = [
      event({
        id: "e1",
        conversationId: "conv-1",
        conversationChannel: "whatsapp",
        conversationStatus: "resolvida",
        conversationCreatedAt: "2026-07-01T09:00:00.000Z",
        createdAt: "2026-07-01T10:00:00.000Z",
      }),
    ];
    const timeline = buildAttendanceTimeline(events);
    expect(timeline[0]!.channel).toBe("whatsapp");
    expect(timeline[0]!.currentStatus).toBe("resolvida");
    expect(timeline[0]!.createdAt).toBe("2026-07-01T09:00:00.000Z");
  });

  it("returns an empty array for no events", () => {
    expect(buildAttendanceTimeline([])).toEqual([]);
  });
});
