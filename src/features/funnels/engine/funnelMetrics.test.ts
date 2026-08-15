import { describe, expect, it } from "vitest";
import type { ILeadFunnelEntry } from "@/shared/types";
import { countDistinctLeads, daysInStage, summariseStage } from "./funnelMetrics";

function entry(leadId: string, funnelId: string, over: Partial<ILeadFunnelEntry> = {}): ILeadFunnelEntry {
  return {
    id: `${leadId}-${funnelId}`, leadId, funnelId, stageId: "s-1", storeId: "store-1",
    sellerId: "seller-1", enteredStageAt: "2026-07-01T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z", ...over,
  };
}

describe("countDistinctLeads", () => {
  // Summing per-funnel counts would report 3 for a base of 2 people.
  it("counts a lead once even when it lives in several funnels", () => {
    const entries = [
      entry("lead-1", "catalisador"),
      entry("lead-1", "filtros"),
      entry("lead-2", "filtros"),
    ];
    expect(countDistinctLeads(entries)).toBe(2);
  });

  it("is zero for an empty list", () => {
    expect(countDistinctLeads([])).toBe(0);
  });
});

describe("summariseStage", () => {
  const now = new Date("2026-07-23T12:00:00.000Z");

  it("sums the membership value, never the lead value", () => {
    const summary = summariseStage({
      stageId: "s-1",
      entries: [
        entry("lead-1", "catalisador", { estimatedValue: 8000 }),
        entry("lead-2", "catalisador", { estimatedValue: 4400 }),
      ],
      nextActionByLeadId: {},
      now,
    });
    expect(summary.sumValue).toBe(12400);
    expect(summary.count).toBe(2);
  });

  // Guards against a plausible wrong-fix: deduping by leadId here would break
  // the N:N model, since the same lead in the same funnel twice (two
  // memberships) still represents two distinct opportunities/revenues.
  it("sums each membership independently, never deduping by lead", () => {
    const summary = summariseStage({
      stageId: "s-1",
      entries: [
        entry("lead-1", "catalisador", { estimatedValue: 8000 }),
        entry("lead-1", "filtros", { estimatedValue: 4400 }),
      ],
      nextActionByLeadId: {},
      now,
    });
    expect(summary.count).toBe(2);
    expect(summary.sumValue).toBe(12400);
  });

  it("treats a membership with no value as zero", () => {
    const summary = summariseStage({
      stageId: "s-1",
      entries: [entry("lead-1", "catalisador")],
      nextActionByLeadId: {},
      now,
    });
    expect(summary.sumValue).toBe(0);
  });

  it("counts overdue next actions", () => {
    const summary = summariseStage({
      stageId: "s-1",
      entries: [entry("lead-1", "catalisador"), entry("lead-2", "catalisador")],
      nextActionByLeadId: {
        "lead-1": "2026-07-20T00:00:00.000Z", // past
        "lead-2": "2026-08-01T00:00:00.000Z", // future
      },
      now,
    });
    expect(summary.overdueCount).toBe(1);
  });

  it("does not count a lead with no scheduled next action as overdue", () => {
    const summary = summariseStage({
      stageId: "s-1",
      entries: [entry("lead-1", "catalisador")],
      nextActionByLeadId: {},
      now,
    });
    expect(summary.overdueCount).toBe(0);
  });

  // Finding 10: overdue must compare CALENDAR DATES in São Paulo, not raw
  // instants — nextActionAt's UTC date part is the due date (see
  // leads/utils/leadDraft.ts), and must not be shifted before reading it.
  describe("overdue timezone boundary (Finding 10)", () => {
    // 23:00 in São Paulo (UTC-03:00) on 2026-07-23 is 2026-07-24T02:00:00Z.
    const lateEveningSaoPaulo = new Date("2026-07-24T02:00:00.000Z");

    it("does NOT count today's (São Paulo) due date as overdue at 23:00 local", () => {
      const summary = summariseStage({
        stageId: "s-1",
        entries: [entry("lead-1", "catalisador")],
        // Due date encoded as UTC midnight of 2026-07-23 (today in São Paulo
        // at this instant) — see leadDraft.ts's date-only picker convention.
        nextActionByLeadId: { "lead-1": "2026-07-23T00:00:00.000Z" },
        now: lateEveningSaoPaulo,
      });
      expect(summary.overdueCount).toBe(0);
    });

    it("counts yesterday's due date as overdue", () => {
      const summary = summariseStage({
        stageId: "s-1",
        entries: [entry("lead-1", "catalisador")],
        nextActionByLeadId: { "lead-1": "2026-07-22T00:00:00.000Z" },
        now: lateEveningSaoPaulo,
      });
      expect(summary.overdueCount).toBe(1);
    });

    it("does not misfire in the 21:00-to-midnight São Paulo window (old bug)", () => {
      // 21:30 in São Paulo on 2026-07-22 is 2026-07-23T00:30:00Z — a raw
      // instant compare against a due date encoded as 2026-07-23T00:00:00Z
      // (UTC midnight = the due date itself) would wrongly fire, ~3h early,
      // because the instant already lies in the past even though "today" in
      // São Paulo is still 2026-07-22.
      const nowInWindow = new Date("2026-07-23T00:30:00.000Z");
      const summary = summariseStage({
        stageId: "s-1",
        entries: [entry("lead-1", "catalisador")],
        nextActionByLeadId: { "lead-1": "2026-07-23T00:00:00.000Z" },
        now: nowInWindow,
      });
      expect(summary.overdueCount).toBe(0);
    });
  });

  // A caller may pass a whole funnel's entries (every stage mixed together)
  // instead of pre-filtering to one column — summariseStage must still return
  // ONLY that stage's own figures, not the funnel's total mislabelled with
  // this stageId.
  it("filters to only the matching stage's entries when passed a mixed-stage array", () => {
    const summary = summariseStage({
      stageId: "s-1",
      entries: [
        entry("lead-1", "catalisador", { stageId: "s-1", estimatedValue: 8000 }),
        entry("lead-2", "catalisador", { stageId: "s-2", estimatedValue: 4400 }),
        entry("lead-3", "catalisador", { stageId: "s-1", estimatedValue: 1000 }),
      ],
      nextActionByLeadId: {},
      now,
    });
    expect(summary.count).toBe(2);
    expect(summary.sumValue).toBe(9000);
  });
});

describe("daysInStage", () => {
  it("measures from enteredStageAt, not from the lead's updatedAt", () => {
    const now = new Date("2026-07-23T00:00:00.000Z");
    const e = entry("lead-1", "catalisador", {
      enteredStageAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z",
    });
    expect(daysInStage(e, now)).toBe(10);
  });

  it("is zero on the day it entered", () => {
    const now = new Date("2026-07-23T18:00:00.000Z");
    const e = entry("lead-1", "catalisador", { enteredStageAt: "2026-07-23T09:00:00.000Z" });
    expect(daysInStage(e, now)).toBe(0);
  });
});
