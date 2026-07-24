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
// Relative import to the mock store's internal reset — mirrors how
// `leadFunnels.ts` itself reaches `getMockState` (see the mock-provider
// ESLint carve-out in `eslint.config.js`: alias imports like `@/mocks/store/*`
// stay forbidden even inside `impl/mock`, but this relative path is the same
// escape hatch the provider under test already uses). This is the store-level
// reset `useResetMocks` calls — the React hook itself isn't callable outside
// a component, so the test drives the underlying primitive directly.
import { getMockState, resetMockStore } from "../../../../mocks/store/mockStore";

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

/**
 * Regression coverage for finding 11a: nothing in the mock layer used to
 * mirror the production trigger `leads_assign_default_funnel_membership` —
 * a lead created through `mockLeadsProvider.create` (NewLeadModal, the
 * WhatsApp webhook simulator, ...) had zero funnel memberships and was
 * silently omitted from every funnel-scoped board.
 */
describe("mockLeadsProvider.create — default funnel membership (finding 11a)", () => {
  it("gives a newly created lead exactly one membership, in the store's default funnel", async () => {
    const created = await mockLeadsProvider.create({
      storeId: "00000000-0000-0000-0000-000000000001",
      sellerId: null,
      name: "Lead de teste — finding 11a",
      phone: "5511999990000",
      stage: { id: "stage-novo", name: "Novo", order: 0, color: "#000000" },
      temperature: "morno",
      origin: "outro",
      tags: [],
    });

    const memberships = await mockLeadFunnelsProvider.listEntriesByLead(created.id);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.funnelId).toBe(DEFAULT_FUNNEL_ID);
  });

  it("makes the new lead show up in a funnel-scoped list, not just the unfiltered one", async () => {
    const created = await mockLeadsProvider.create({
      storeId: "00000000-0000-0000-0000-000000000001",
      sellerId: null,
      name: "Lead de teste — finding 11a (board)",
      phone: "5511999990001",
      stage: { id: "stage-novo", name: "Novo", order: 0, color: "#000000" },
      temperature: "frio",
      origin: "whatsapp",
      tags: [],
    });

    const scoped = await mockLeadsProvider.list({
      funnelId: DEFAULT_FUNNEL_ID,
      pageSize: 10_000,
    });
    expect(scoped.data.map((l) => l.id)).toContain(created.id);
  });
});

/**
 * Regression coverage for finding 11b (remediation v2): `reconcileWithLeadStore`
 * originally reconciled by id-set membership (drop entries whose `leadId`
 * vanished, backfill leads with none) — INEFFECTIVE against a mock-store
 * reset. `VOLUMES.leads` is a fixed count and mock lead ids are index-derived
 * (`lead-0001..NNNN`, see `mocks/generators/lead.ts`), so a reset regenerates
 * the SAME ids attached to ENTIRELY different records. The id-set diff found
 * nothing to drop/backfill, so every stale membership survived — pointing at
 * the WRONG (reused) lead's stage, silently wrong instead of visibly missing.
 *
 * This pins the exact property that failed under the old reconcile: after a
 * reset, the set of leads with a `ganho` membership must equal the set of
 * leads that are ACTUALLY converted post-reset.
 */
describe("mockLeadFunnelsProvider — reconcile after a mock-store reset (finding 11b, remediation v2)", () => {
  it("re-derives every membership from the current lead set — won memberships track actually-converted leads", async () => {
    // Force seeding before the reset, so this test genuinely exercises the
    // POST-reset reconcile branch (`reconcileWithLeadStore`) rather than a
    // fresh `seedOnce()` that happens to run after the reset by coincidence.
    await mockLeadFunnelsProvider.listEntriesByFunnel(DEFAULT_FUNNEL_ID);

    // Drive the store-level reset directly — the same primitive
    // `useResetMocks` calls (`resetMockStore`), with a DIFFERENT seed
    // (mirroring its default `Date.now() % 100_000`, which is virtually never
    // the seed already loaded) — swaps `leads` for a new array of
    // `VOLUMES.leads` entries carrying the SAME `lead-0001..NNNN` ids but
    // different converted/lost/stage data. `useResetMocks` itself is a React
    // hook and isn't callable outside a component, so the test drives the
    // underlying store primitive it wraps.
    resetMockStore(90210);

    const currentLeads = getMockState().leads;
    const actuallyWonLeadIds = new Set(
      currentLeads.filter((l) => l.convertedToCustomerId !== undefined).map((l) => l.id),
    );
    // Sanity: the reseeded dataset must contain at least one converted lead,
    // or this test can't distinguish "reconciled correctly" from "nothing to
    // reconcile".
    expect(actuallyWonLeadIds.size).toBeGreaterThan(0);

    const stages = await mockLeadFunnelsProvider.listStages(DEFAULT_FUNNEL_ID);
    const wonStage = stages.find((s) => s.kind === "ganho");
    if (!wonStage) throw new Error("default funnel seed produced no 'ganho' stage");

    const entries = await mockLeadFunnelsProvider.listEntriesByFunnel(DEFAULT_FUNNEL_ID);
    const wonMembershipLeadIds = new Set(
      entries.filter((e) => e.stageId === wonStage.id).map((e) => e.leadId),
    );

    // The exact assertion that failed before the fix (`sets match? false`):
    // every lead with a `ganho` membership post-reconcile is exactly the set
    // of leads actually converted post-reset — no stale winners, none missing.
    expect([...wonMembershipLeadIds].sort()).toEqual([...actuallyWonLeadIds].sort());

    // Full re-derivation, not a partial id-set patch: every current lead has
    // exactly one membership in the default funnel — none orphaned from
    // before the reset, none missing.
    expect(entries).toHaveLength(currentLeads.length);
    const membershipLeadIds = new Set(entries.map((e) => e.leadId));
    expect(membershipLeadIds.size).toBe(currentLeads.length);
  });
});
