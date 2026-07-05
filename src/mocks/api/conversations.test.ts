import { describe, it, expect } from "vitest";
import { matchesAssignmentAny, conversationsApi } from "./conversations";
import { conversationParticipantsApi, clearConversationParticipantsSync } from "./conversationParticipants";
import { getMockState } from "../store/mockStore";
import type { IConversation } from "@/shared/types";

function conv(over: Partial<IConversation>): IConversation {
  return {
    assignedSellerId: undefined,
    isSdrActive: false,
    status: "aguardando",
    ...(over as object),
  } as IConversation;
}

describe("matchesAssignmentAny", () => {
  it("matches a specific seller", () => {
    expect(matchesAssignmentAny(conv({ assignedSellerId: "s1" }), { sellerIds: ["s1"] })).toBe(true);
    expect(matchesAssignmentAny(conv({ assignedSellerId: "s2" }), { sellerIds: ["s1"] })).toBe(false);
  });
  it("matches the queue (pool + sdr off + aguardando)", () => {
    expect(
      matchesAssignmentAny(conv({ assignedSellerId: undefined, isSdrActive: false, status: "aguardando" }), {
        queue: true,
      }),
    ).toBe(true);
    expect(
      matchesAssignmentAny(conv({ assignedSellerId: undefined, isSdrActive: true, status: "aguardando" }), {
        queue: true,
      }),
    ).toBe(false);
    expect(
      matchesAssignmentAny(conv({ assignedSellerId: undefined, status: "em_andamento" }), { queue: true }),
    ).toBe(false);
  });
  it("ORs criteria together", () => {
    const c = conv({ assignedSellerId: "s9" });
    const queued = conv({ assignedSellerId: undefined, status: "aguardando", isSdrActive: false });
    expect(matchesAssignmentAny(c, { sellerIds: ["s1"], queue: true })).toBe(false);
    expect(matchesAssignmentAny(c, { sellerIds: ["s9"], queue: true })).toBe(true);
    expect(matchesAssignmentAny(queued, { sellerIds: ["s1"], queue: true })).toBe(true);
  });
});

describe("conversationsApi.list — collaborator inclusion in 'Minhas conversas'", () => {
  it("includes a conversation the filtered seller collaborates on, not just owns", async () => {
    const seed = getMockState().conversations[0];
    if (!seed) throw new Error("mock seed has no conversations to test against");
    const collaboratorSellerId = "seller-test-collaborator-inclusion";

    const before = await conversationsApi.list({ assignmentAny: { sellerIds: [collaboratorSellerId] } });
    expect(before.data.some((c) => c.id === seed.id)).toBe(false);

    await conversationParticipantsApi.add(seed.id, collaboratorSellerId, "manual");
    const after = await conversationsApi.list({ assignmentAny: { sellerIds: [collaboratorSellerId] } });
    expect(after.data.some((c) => c.id === seed.id)).toBe(true);

    clearConversationParticipantsSync(seed.id);
  });

  it("close() clears the conversation's collaborators", async () => {
    const seed = getMockState().conversations.find((c) => c.status !== "arquivada" && c.status !== "resolvida");
    if (!seed) throw new Error("mock seed has no open conversation to test against");
    const collaboratorSellerId = "seller-test-close-cleanup";

    await conversationParticipantsApi.add(seed.id, collaboratorSellerId, "manual");
    expect((await conversationParticipantsApi.list(seed.id)).length).toBeGreaterThan(0);

    await conversationsApi.close(seed.id, "resolvida");
    expect(await conversationParticipantsApi.list(seed.id)).toEqual([]);
  });
});
