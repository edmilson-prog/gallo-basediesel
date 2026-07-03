import { describe, expect, it } from "vitest";
import type { ID, ISeller, IConversationActivityEvent } from "@/shared/types";
import { buildAttendanceTimeline } from "../engine/attendanceTimeline";
import { actorLabel, describeEvent } from "../utils/eventDescription";
import { ATTENDANCE_HISTORY_STRINGS as S } from "../i18n/pt-BR";
import { CONVERSATION_STRINGS } from "@/features/conversations/i18n/pt-BR";

/**
 * The panel itself is a thin JSX shell over `buildAttendanceTimeline` +
 * `eventDescription` — this repo has no jsdom/@testing-library setup (vitest
 * runs `environment: "node"`), so instead of rendering we drive the exact
 * pipeline the component uses on a fixed event set and assert the resulting
 * grouped-card view-model: two conversations, chronological nodes, and one
 * system-authored reopen row rendered distinctly from seller-authored ones.
 */

function seller(id: ID, fullName: string): ISeller {
  return {
    id,
    storeId: "store-1",
    fullName,
    email: `${id}@example.com`,
    type: "internal",
    availability: "online",
    divisions: ["parts"],
  } as ISeller;
}

function baseEvent(overrides: Partial<IConversationActivityEvent>): IConversationActivityEvent {
  return {
    id: overrides.id ?? "evt",
    conversationId: overrides.conversationId ?? "conv-1",
    customerId: "customer-1",
    storeId: "store-1",
    type: "status",
    actorKind: "seller",
    createdAt: "2026-07-01T10:00:00.000Z",
    conversationChannel: "whatsapp",
    conversationStatus: "em_andamento",
    conversationCreatedAt: "2026-07-01T09:00:00.000Z",
    ...overrides,
  };
}

describe("AttendanceHistoryPanel view-model pipeline", () => {
  const sellersById = new Map<ID, ISeller>([["seller-1", seller("seller-1", "Carla Souza")]]);

  const events: IConversationActivityEvent[] = [
    // Conversation A — created, assigned from the queue, then resolved.
    baseEvent({
      id: "a1",
      conversationId: "conv-a",
      type: "created",
      toStatus: "aguardando",
      createdAt: "2026-07-01T09:00:00.000Z",
      conversationStatus: "resolvida",
    }),
    baseEvent({
      id: "a2",
      conversationId: "conv-a",
      type: "assignment",
      toSellerId: "seller-1",
      actorId: "seller-1",
      createdAt: "2026-07-01T09:05:00.000Z",
      conversationStatus: "resolvida",
    }),
    baseEvent({
      id: "a3",
      conversationId: "conv-a",
      type: "status",
      fromStatus: "em_andamento",
      toStatus: "resolvida",
      actorId: "seller-1",
      createdAt: "2026-07-01T09:30:00.000Z",
      conversationStatus: "resolvida",
    }),
    // Conversation B — the system reopens it on a later inbound message.
    baseEvent({
      id: "b1",
      conversationId: "conv-b",
      type: "status",
      toStatus: "resolvida",
      actorId: "seller-1",
      createdAt: "2026-07-01T08:00:00.000Z",
      conversationStatus: "aguardando",
    }),
    baseEvent({
      id: "b2",
      conversationId: "conv-b",
      type: "reopen",
      fromStatus: "resolvida",
      toStatus: "aguardando",
      actorKind: "system",
      actorId: null,
      createdAt: "2026-07-01T11:00:00.000Z",
      conversationStatus: "aguardando",
    }),
  ];

  it("groups events into one card per conversation", () => {
    const timelines = buildAttendanceTimeline(events);
    expect(timelines).toHaveLength(2);
    expect(timelines.map((t) => t.conversationId).sort()).toEqual(["conv-a", "conv-b"]);
  });

  it("orders conversation B most-recent-first (its last node is the latest)", () => {
    const timelines = buildAttendanceTimeline(events);
    expect(timelines[0]!.conversationId).toBe("conv-b");
  });

  it("describes the seller-authored assignment as taking it from the queue", () => {
    const event = events.find((e) => e.id === "a2")!;
    const actor = actorLabel(event, sellersById);
    expect(actor.isSystem).toBe(false);
    expect(actor.label).toBe("Carla Souza");
    expect(describeEvent(event, sellersById)).toBe(S.assumedFromQueue);
  });

  it("renders exactly one system-authored reopen row, distinct from seller rows", () => {
    const timelines = buildAttendanceTimeline(events);
    const convB = timelines.find((t) => t.conversationId === "conv-b")!;
    const systemNodes = convB.nodes.filter((n) => n.event.actorKind === "system");
    expect(systemNodes).toHaveLength(1);

    const [reopenNode] = systemNodes;
    expect(reopenNode!.event.type).toBe("reopen");

    const actor = actorLabel(reopenNode!.event, sellersById);
    expect(actor.isSystem).toBe(true);
    expect(actor.label).toBe(S.system);
    // `toStatus` is set on the reopen node, so it describes the resulting
    // status (mirrors CONVERSATION_STRINGS.statusLabel), not the generic tag.
    expect(describeEvent(reopenNode!.event, sellersById)).toBe(
      CONVERSATION_STRINGS.statusLabel.aguardando,
    );
  });
});
