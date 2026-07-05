import { describe, it, expect, vi } from "vitest";

// Tests run with no persisted session, so getCurrentMockSellerId() would be
// null; pin it to a known seller so the isCollaborator stamp path is testable.
// emitConversationActivity stays real (importActual) — close/archive/update
// still exercise their real activity side-effects.
const MOCK_CURRENT_SELLER = "mock-current-seller";
vi.mock("./_emitConversationActivity", async (importActual) => {
  const actual = await importActual<typeof import("./_emitConversationActivity")>();
  return { ...actual, getCurrentMockSellerId: () => MOCK_CURRENT_SELLER };
});

import { matchesAssignmentAny, conversationsApi } from "./conversations";
import { conversationParticipantsApi, clearConversationParticipantsSync } from "./conversationParticipants";
import { getMockState } from "../store/mockStore";
import { resetMockStorePerFile } from "@/mocks/test-setup";
import type { IConversation } from "@/shared/types";

resetMockStorePerFile();

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

    try {
      const before = await conversationsApi.list({ assignmentAny: { sellerIds: [collaboratorSellerId] } });
      expect(before.data.some((c) => c.id === seed.id)).toBe(false);

      await conversationParticipantsApi.add(seed.id, collaboratorSellerId, "manual");
      const after = await conversationsApi.list({ assignmentAny: { sellerIds: [collaboratorSellerId] } });
      expect(after.data.some((c) => c.id === seed.id)).toBe(true);
    } finally {
      clearConversationParticipantsSync(seed.id);
    }
  });

  it("close() clears the conversation's collaborators", async () => {
    // Explicitly excludes conversations[0] (the previous test's seed) so the two
    // tests are provably independent regardless of run order, not just
    // incidentally distinct because `.find` happens to skip index 0 today.
    const priorTestSeedId = getMockState().conversations[0]?.id;
    const seed = getMockState().conversations.find(
      (c) => c.id !== priorTestSeedId && c.status !== "arquivada" && c.status !== "resolvida",
    );
    if (!seed) throw new Error("mock seed has no open conversation to test against");
    const collaboratorSellerId = "seller-test-close-cleanup";

    await conversationParticipantsApi.add(seed.id, collaboratorSellerId, "manual");
    expect((await conversationParticipantsApi.list(seed.id)).length).toBeGreaterThan(0);

    await conversationsApi.close(seed.id, "resolvida");
    expect(await conversationParticipantsApi.list(seed.id)).toEqual([]);
  });

  it("archive() and update({status}) into a terminal state clear collaborators", async () => {
    const seeds = getMockState().conversations.filter(
      (c) => c.status !== "arquivada" && c.status !== "resolvida",
    );
    const forArchive = seeds[0];
    const forUpdate = seeds.find((c) => c.id !== forArchive?.id);
    if (!forArchive || !forUpdate) throw new Error("need two open mock conversations");

    await conversationParticipantsApi.add(forArchive.id, "seller-archive-cleanup", "manual");
    await conversationsApi.archive(forArchive.id);
    expect(await conversationParticipantsApi.list(forArchive.id)).toEqual([]);

    await conversationParticipantsApi.add(forUpdate.id, "seller-update-cleanup", "manual");
    await conversationsApi.update(forUpdate.id, { status: "resolvida" });
    expect(await conversationParticipantsApi.list(forUpdate.id)).toEqual([]);
  });
});

describe("conversationsApi — isCollaborator stamp (parity with supabase RPCs)", () => {
  it("stamps isCollaborator on conversations the current seller participates in", async () => {
    const seed = getMockState().conversations.find(
      (c) => c.status !== "arquivada" && c.status !== "resolvida",
    );
    if (!seed) throw new Error("mock seed has no open conversation to test against");

    try {
      await conversationParticipantsApi.add(seed.id, MOCK_CURRENT_SELLER, "manual");
      // Large page so the seed is guaranteed on the page regardless of sort.
      const page = await conversationsApi.list({ pageSize: 1000 });
      expect(page.data.find((c) => c.id === seed.id)?.isCollaborator).toBe(true);
      // A conversation the current seller does NOT collaborate on stays unset.
      const other = page.data.find((c) => c.id !== seed.id);
      expect(other?.isCollaborator).toBeUndefined();
    } finally {
      clearConversationParticipantsSync(seed.id);
    }
  });
});
