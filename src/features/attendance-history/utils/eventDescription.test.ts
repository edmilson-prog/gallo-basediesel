import { describe, expect, it } from "vitest";
import type { ID, ISeller, IConversationActivityEvent } from "@/shared/types";
import { describeEvent } from "./eventDescription";

const sellers = new Map<ID, ISeller>([
  ["seller-A", { fullName: "Tiago Oliveira" } as ISeller],
  ["seller-B", { fullName: "Lucas Costa" } as ISeller],
]);

function ev(overrides: Partial<IConversationActivityEvent>): IConversationActivityEvent {
  return {
    id: "e",
    conversationId: "c",
    storeId: "s",
    type: "created",
    fromStatus: null,
    toStatus: null,
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

describe("describeEvent — collaborators", () => {
  it("participant_add names the invited collaborator (toSellerId)", () => {
    const out = describeEvent(
      ev({ type: "participant_add", toSellerId: "seller-B", actorId: "seller-A", actorKind: "seller" }),
      sellers,
    );
    expect(out).toBe("adicionou Lucas Costa como colaborador");
  });

  it("participant_remove by someone else names the removed collaborator", () => {
    const out = describeEvent(
      ev({ type: "participant_remove", toSellerId: "seller-B", actorId: "seller-A", actorKind: "seller" }),
      sellers,
    );
    expect(out).toBe("removeu Lucas Costa da conversa");
  });

  it("self-removal (actor === collaborator) reads 'saiu da conversa'", () => {
    const out = describeEvent(
      ev({ type: "participant_remove", toSellerId: "seller-B", actorId: "seller-B", actorKind: "seller" }),
      sellers,
    );
    expect(out).toBe("saiu da conversa");
  });
});
