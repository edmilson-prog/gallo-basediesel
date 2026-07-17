import { describe, expect, it, vi, beforeEach } from "vitest";

// `getIdleSummary` must resolve the current SELLER id (ISeller.id, e.g.
// "seller-carlos-santos") from the session's `sellerId` field — NOT the
// auth/profile id (e.g. "mock-vendedor-lucas") that `getCurrentContext().user.id`
// carries. Mock the session-mirror reader at its source so we can drive both
// shapes deterministically, mirroring the pattern `mocks/api/conversations.test.ts`
// uses for `getCurrentMockSellerId`.
vi.mock("@/features/auth/guards", () => ({
  readCurrentUserSync: vi.fn(),
}));

import { mockConversationsProvider } from "./conversations";
import { readCurrentUserSync } from "@/features/auth/guards";
import { settingsApi } from "@/mocks";
import { getMockState, useMockStore } from "@/mocks/store/mockStore";
import { resetMockStorePerFile } from "@/mocks/test-setup";
import type { IConversation, IMessage } from "@/shared/types";

resetMockStorePerFile();

const mockedReadCurrentUserSync = vi.mocked(readCurrentUserSync);

// Stable seeded roster (src/mocks/data/seedSellers.ts) — real ISeller rows
// with no `workSchedule`, so idle business-time falls back to raw clock time
// (see businessSecondsBetween: absent schedule ⇒ raw elapsed seconds).
const SELLER_ID = "seller-carlos-santos";
const OTHER_SELLER_ID = "seller-rafael-lima";
const STORE_ID = "00000000-0000-0000-0000-000000000001";

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

async function enableIdleAlerts(): Promise<void> {
  await settingsApi.update(STORE_ID, {
    idleAlerts: {
      enabled: true,
      level1Hours: 2,
      level2Hours: 8,
      level3Hours: 24,
      notifyManagerOnLevel3: true,
    },
  });
}

function seedConversation(overrides: Partial<IConversation> & { id: string }): IConversation {
  const conversation: IConversation = {
    storeId: STORE_ID,
    channel: "whatsapp",
    status: "aguardando",
    isSdrActive: false,
    tags: [],
    lastMessageAt: new Date().toISOString(),
    unreadCount: 1,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
  useMockStore.setState((state) => ({ conversations: [...state.conversations, conversation] }));
  return conversation;
}

function seedInboundMessage(conversationId: string, sentAt: string): IMessage {
  const message: IMessage = {
    id: `msg-idle-test-${conversationId}`,
    conversationId,
    direction: "in",
    authorType: "customer",
    provider: "mock",
    text: "Ainda tem essa peça em estoque?",
    status: "delivered",
    sentAt,
  };
  useMockStore.setState((state) => ({ messages: [...state.messages, message] }));
  return message;
}

describe("mockConversationsProvider.getIdleSummary", () => {
  beforeEach(() => {
    mockedReadCurrentUserSync.mockReset();
  });

  it("returns the empty summary without throwing when the signed-in profile carries no sellerId", async () => {
    await enableIdleAlerts();
    // e.g. the AILA admin profile: real session, but no linked ISeller.
    mockedReadCurrentUserSync.mockReturnValue({
      id: "mock-admin-aila",
      role: "Owner",
      sellerId: null,
    });

    const summary = await mockConversationsProvider.getIdleSummary();

    expect(summary).toEqual({ counts: { level1: 0, level2: 0, level3: 0 }, entries: [] });
  });

  it("returns the empty summary without throwing when there is no signed-in user at all", async () => {
    await enableIdleAlerts();
    mockedReadCurrentUserSync.mockReturnValue(null);

    const summary = await mockConversationsProvider.getIdleSummary();

    expect(summary).toEqual({ counts: { level1: 0, level2: 0, level3: 0 }, entries: [] });
  });

  it("resolves the SELLER id from sellerId (not the auth/profile id) and returns level-ordered idle entries", async () => {
    await enableIdleAlerts();
    // The auth/profile id ("mock-vendedor-lucas") intentionally does NOT match
    // any ISeller.id — if getIdleSummary ever regresses to reading `user.id`
    // again, `conversationsApi.listAwaitingReply` throws MockNotFoundError("seller", ...)
    // and this test fails loudly instead of silently returning nothing.
    mockedReadCurrentUserSync.mockReturnValue({
      id: "mock-vendedor-lucas",
      role: "Vendedor",
      sellerId: SELLER_ID,
    });

    const convLevel1 = seedConversation({
      id: "conv-idle-test-l1",
      assignedSellerId: SELLER_ID,
      status: "aguardando",
    });
    seedInboundMessage(convLevel1.id, isoHoursAgo(3)); // > level1Hours(2h), < level2Hours(8h) => level 1

    const convLevel2 = seedConversation({
      id: "conv-idle-test-l2",
      assignedSellerId: SELLER_ID,
      status: "em_andamento",
    });
    seedInboundMessage(convLevel2.id, isoHoursAgo(10)); // > level2Hours(8h), < level3Hours(24h) => level 2

    // Distractor: belongs to a different seller — must never show up.
    const convOtherSeller = seedConversation({
      id: "conv-idle-test-other-seller",
      assignedSellerId: OTHER_SELLER_ID,
      status: "aguardando",
    });
    seedInboundMessage(convOtherSeller.id, isoHoursAgo(30));

    // Distractor: same seller, but already answered — must never show up.
    const convAnswered = seedConversation({
      id: "conv-idle-test-answered",
      assignedSellerId: SELLER_ID,
      status: "em_andamento",
    });
    seedInboundMessage(convAnswered.id, isoHoursAgo(20));
    useMockStore.setState((state) => ({
      messages: [
        ...state.messages,
        {
          id: "msg-idle-test-answered-out",
          conversationId: convAnswered.id,
          direction: "out",
          authorType: "seller",
          authorId: SELLER_ID,
          provider: "mock",
          text: "Sim, temos em estoque!",
          status: "sent",
          sentAt: isoHoursAgo(19),
        },
      ],
    }));

    const summary = await mockConversationsProvider.getIdleSummary();

    // The seed dataset already carries its own idle-conversation fixtures for
    // this seller (e.g. "scripted-conv-*-dormente"), so assert on OUR entries
    // by id rather than the full list — resilient to the seed's own volume.
    const ours = summary.entries.filter((e) =>
      [convLevel1.id, convLevel2.id].includes(e.conversationId),
    );
    expect(ours.map((e) => e.conversationId)).toEqual([convLevel2.id, convLevel1.id]);
    expect(ours[0]!.level).toBe(2);
    expect(ours[1]!.level).toBe(1);
    // Distractors must never surface: wrong seller, and already-answered.
    expect(summary.entries.some((e) => e.conversationId === convOtherSeller.id)).toBe(false);
    expect(summary.entries.some((e) => e.conversationId === convAnswered.id)).toBe(false);
    // Sanity: the seed store really does resolve SELLER_ID to a real ISeller,
    // proving the assertions above exercise the fixed path, not a lucky no-op.
    expect(getMockState().sellers.some((s) => s.id === SELLER_ID)).toBe(true);
  });

  it("returns the empty summary when the store's idleAlerts setting is disabled (default)", async () => {
    // No enableIdleAlerts() call — DEFAULT_IDLE_ALERTS_SETTINGS.enabled === false.
    await settingsApi.update(STORE_ID, { idleAlerts: undefined });
    mockedReadCurrentUserSync.mockReturnValue({
      id: "mock-vendedor-lucas",
      role: "Vendedor",
      sellerId: SELLER_ID,
    });

    const conv = seedConversation({
      id: "conv-idle-test-disabled",
      assignedSellerId: SELLER_ID,
      status: "aguardando",
    });
    seedInboundMessage(conv.id, isoHoursAgo(30));

    const summary = await mockConversationsProvider.getIdleSummary();

    expect(summary).toEqual({ counts: { level1: 0, level2: 0, level3: 0 }, entries: [] });
  });
});
