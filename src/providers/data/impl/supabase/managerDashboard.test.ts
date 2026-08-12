import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IConversation, ICustomer, ISeller } from "@/shared/types";
import type { IPaginatedResult } from "../../contracts/_shared";

const { conversationsList, customersList, sellersList, messagesListForAnalytics } = vi.hoisted(() => ({
  conversationsList: vi.fn(),
  customersList: vi.fn(),
  sellersList: vi.fn(),
  messagesListForAnalytics: vi.fn(),
}));

vi.mock("./conversations", () => ({
  supabaseConversationsProvider: { list: conversationsList },
}));
vi.mock("./customers", () => ({
  supabaseCustomersProvider: { list: customersList },
}));
vi.mock("./sellers", () => ({
  supabaseSellersProvider: { list: sellersList },
}));
vi.mock("./messages", () => ({
  supabaseMessagesProvider: { listForAnalytics: messagesListForAnalytics },
}));

import { supabaseManagerDashboardProvider as P } from "./managerDashboard";

const PARAMS = {
  storeId: "store-1",
  fromIso: "2026-07-01T00:00:00.000Z",
  toIso: "2026-07-02T00:00:00.000Z",
  prevFromIso: "2026-06-30T00:00:00.000Z",
  prevToIso: "2026-07-01T00:00:00.000Z",
};

function conversationPage(count: number, page: number, pageSize: number): IPaginatedResult<IConversation> {
  const data = Array.from({ length: count }, (_, i) => ({
    id: `c${page}-${i}`,
    lastMessageAt: PARAMS.fromIso,
    status: "aguardando",
  })) as unknown as IConversation[];
  return { data, total: -1, page, pageSize };
}

beforeEach(() => {
  conversationsList.mockReset();
  customersList.mockReset();
  sellersList.mockReset();
  messagesListForAnalytics.mockReset();
  sellersList.mockResolvedValue([] as ISeller[]);
  customersList.mockResolvedValue({ data: [] as ICustomer[], total: 0, page: 1, pageSize: 200 });
  messagesListForAnalytics.mockResolvedValue([]);
});

describe("supabaseManagerDashboardProvider.snapshot", () => {
  it("drains conversation pages without paying for an exact count on every page", async () => {
    // Page 1 comes back full (1000 rows) so the drain must fetch page 2; page
    // 2 comes back short (50 rows), which is the ONLY signal that should be
    // needed to know the drain is done — it must not depend on `total`.
    conversationsList
      .mockResolvedValueOnce(conversationPage(1000, 1, 1000))
      .mockResolvedValueOnce(conversationPage(50, 2, 1000));

    const snapshot = await P.snapshot(PARAMS);

    expect(conversationsList).toHaveBeenCalledTimes(2);
    // Every page request must opt out of `count: "exact"` — recomputing the
    // exact count on each page re-runs the per-row `can_access_conversation`
    // RLS check over the WHOLE candidate set every time (~4s alone for a
    // ~3k-conversation store), which is what left the first KPI row stuck on
    // its loading skeleton in production.
    for (const call of conversationsList.mock.calls) {
      expect(call[0]).toMatchObject({ withTotal: false });
    }
    // All 1050 drained rows carry status "aguardando" (in OPEN_STATUSES) —
    // confirms the full drained set (both pages), not just the first page,
    // feeds `openConversations`.
    expect(snapshot.openConversations).toHaveLength(1050);
  });

  it("stops after a single page when the first page is already partial", async () => {
    conversationsList.mockResolvedValueOnce(conversationPage(5, 1, 1000));

    await P.snapshot(PARAMS);

    expect(conversationsList).toHaveBeenCalledTimes(1);
  });
});
