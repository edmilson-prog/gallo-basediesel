import { beforeAll, describe, expect, it, vi } from "vitest";

// The RBAC "own"/"store" scoping in `scopedListParams` would otherwise force
// an implicit `storeId` onto every query (see `withStoreScope`), which is
// orthogonal to what this file tests. Mock the session reader at its source
// (same pattern as `conversations.test.ts`) and grant an Owner session, whose
// `lead` permission scope is `all` — `withStoreScope` then passes params
// through untouched, isolating the funnel-filtering logic under test.
vi.mock("@/features/auth/guards", () => ({
  readCurrentUserSync: vi.fn(),
}));

import { readCurrentUserSync } from "@/features/auth/guards";
import { leadsApi } from "@/mocks";
import { resetMockStorePerFile } from "@/mocks/test-setup";
import { mockLeadsProvider } from "./leads";
import { mockLeadFunnelsProvider } from "./leadFunnels";

resetMockStorePerFile();

const mockedReadCurrentUserSync = vi.mocked(readCurrentUserSync);

beforeAll(() => {
  mockedReadCurrentUserSync.mockReturnValue({ id: "test-owner", role: "Owner" });
});

// Every seeded mock lead gets exactly one membership in the store's default
// funnel (see `mockLeadFunnelsProvider`'s `seedOnce`) — `funnel-0` per the
// seed spec order, with the default funnel always first.
const DEFAULT_FUNNEL_ID = "funnel-0";

/**
 * Regression coverage for Finding 3 (Task 18 fix pass): `listByFunnel`
 * filters BEFORE pagination, so `total` must reflect the filtered count, not
 * the base count — and page 2 must slice the filtered set, not the base one.
 */
describe("mockLeadsProvider.list — funnel scope (listByFunnel)", () => {
  it("no funnelId: identical to calling without the param (parity, no regression)", async () => {
    const viaProvider = await mockLeadsProvider.list({});
    const direct = await leadsApi.list({});

    expect(viaProvider.total).toBe(direct.total);
    expect(viaProvider.page).toBe(direct.page);
    expect(viaProvider.pageSize).toBe(direct.pageSize);
    expect(viaProvider.data.map((l) => l.id)).toEqual(direct.data.map((l) => l.id));
  });

  it("funnelId alone: only leads with a membership in that funnel", async () => {
    const entries = await mockLeadFunnelsProvider.listEntriesByFunnel(DEFAULT_FUNNEL_ID);
    const memberLeadIds = new Set(entries.map((e) => e.leadId));
    expect(memberLeadIds.size).toBeGreaterThan(0);

    const result = await mockLeadsProvider.list({
      funnelId: DEFAULT_FUNNEL_ID,
      pageSize: 10_000,
    });

    expect(result.total).toBe(memberLeadIds.size);
    expect(result.data).toHaveLength(memberLeadIds.size);
    for (const lead of result.data) {
      expect(memberLeadIds.has(lead.id)).toBe(true);
    }
  });

  it("funnelId + funnelStageId: only leads at that stage of that funnel", async () => {
    const entries = await mockLeadFunnelsProvider.listEntriesByFunnel(DEFAULT_FUNNEL_ID);
    const targetStageId = entries[0]?.stageId;
    if (targetStageId === undefined) throw new Error("seed produced no funnel entries to target");

    const expectedLeadIds = new Set(
      entries.filter((e) => e.stageId === targetStageId).map((e) => e.leadId),
    );
    // Sanity: the seed must produce a stage that ISN'T the whole funnel, or
    // this test can't distinguish stage-scoping from funnel-scoping alone.
    expect(expectedLeadIds.size).toBeLessThan(entries.length);

    const result = await mockLeadsProvider.list({
      funnelId: DEFAULT_FUNNEL_ID,
      funnelStageId: targetStageId,
      pageSize: 10_000,
    });

    expect(result.total).toBe(expectedLeadIds.size);
    expect(result.data.map((l) => l.id).sort()).toEqual([...expectedLeadIds].sort());
  });

  it("pagination over a filtered set: total is the filtered count, page 2 is the right slice", async () => {
    const full = await mockLeadsProvider.list({
      funnelId: DEFAULT_FUNNEL_ID,
      pageSize: 10_000,
    });
    const filteredTotal = full.total;
    // Need at least 4 members to split into two non-trivial, non-overlapping pages.
    expect(filteredTotal).toBeGreaterThanOrEqual(4);

    const pageSize = Math.floor(filteredTotal / 2);
    const page1 = await mockLeadsProvider.list({
      funnelId: DEFAULT_FUNNEL_ID,
      page: 1,
      pageSize,
    });
    const page2 = await mockLeadsProvider.list({
      funnelId: DEFAULT_FUNNEL_ID,
      page: 2,
      pageSize,
    });

    // `total` reflects the FILTERED count on every page, not the unfiltered
    // base count (which is larger — the mock seeds more leads than just the
    // default funnel's membership once other funnels start getting entries).
    expect(page1.total).toBe(filteredTotal);
    expect(page2.total).toBe(filteredTotal);
    expect(page1.data).toHaveLength(pageSize);

    // Page 2 is the correct slice of the filtered set — not a re-slice of the
    // unfiltered base, and not overlapping page 1.
    expect(page2.data.map((l) => l.id)).toEqual(
      full.data.slice(pageSize, pageSize * 2).map((l) => l.id),
    );
    const page1Ids = new Set(page1.data.map((l) => l.id));
    for (const lead of page2.data) {
      expect(page1Ids.has(lead.id)).toBe(false);
    }
  });
});
