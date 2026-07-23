import { describe, expect, it } from "vitest";
import type { ILeadFunnel, ILeadFunnelEntry, ILeadFunnelStage } from "@/shared/types";
import { planAddToFunnel, planRemoveFromFunnel } from "./membershipRules";

function funnel(id: string, over: Partial<ILeadFunnel> = {}): ILeadFunnel {
  return {
    id, storeId: "store-1", name: id, accent: 1, icon: "mdi:filter-variant",
    position: 0, isDefault: false, openToStore: false, entryAlertThreshold: 50,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
  };
}
function stage(id: string, funnelId: string, over: Partial<ILeadFunnelStage> = {}): ILeadFunnelStage {
  return {
    id, funnelId, name: id, accent: 0, position: 0, kind: "aberta",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
  };
}
function entry(funnelId: string, stageId: string, over: Partial<ILeadFunnelEntry> = {}): ILeadFunnelEntry {
  return {
    id: `e-${funnelId}`, leadId: "lead-1", funnelId, stageId, storeId: "store-1",
    sellerId: "seller-1", enteredStageAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
  };
}

const geral = funnel("geral", { isDefault: true, openToStore: true, accent: 0 });
const catalisador = funnel("catalisador");
const geralEntry = stage("geral-entrada", "geral", { kind: "entrada" });
const cataEntry = stage("cata-entrada", "catalisador", { kind: "entrada" });

describe("planAddToFunnel", () => {
  it("adds to the funnel's entry stage when no stage is given", () => {
    const plan = planAddToFunnel({
      existing: [entry("geral", "geral-entrada")],
      funnel: catalisador,
      stages: [cataEntry],
      leadEstimatedValue: 12400,
    });
    expect(plan.action).toBe("create");
    if (plan.action !== "create") throw new Error("unreachable");
    expect(plan.stageId).toBe("cata-entrada");
  });

  it("inherits the lead's estimated value on the new membership", () => {
    const plan = planAddToFunnel({
      existing: [], funnel: catalisador, stages: [cataEntry], leadEstimatedValue: 12400,
    });
    if (plan.action !== "create") throw new Error("unreachable");
    expect(plan.estimatedValue).toBe(12400);
  });

  it("is a no-op when the lead already participates in that funnel", () => {
    const plan = planAddToFunnel({
      existing: [entry("catalisador", "cata-entrada")],
      funnel: catalisador, stages: [cataEntry], leadEstimatedValue: 12400,
    });
    expect(plan.action).toBe("noop");
  });

  it("refuses a funnel with no entry stage", () => {
    const plan = planAddToFunnel({
      existing: [], funnel: catalisador, stages: [], leadEstimatedValue: undefined,
    });
    expect(plan.action).toBe("error");
  });
});

describe("planRemoveFromFunnel", () => {
  it("removes plainly when other memberships remain", () => {
    const plan = planRemoveFromFunnel({
      existing: [entry("geral", "geral-entrada"), entry("catalisador", "cata-entrada")],
      entryId: "e-catalisador",
      defaultFunnel: geral,
      defaultFunnelStages: [geralEntry],
    });
    expect(plan.action).toBe("remove");
    if (plan.action !== "remove") throw new Error("unreachable");
    expect(plan.movedToDefault).toBe(false);
  });

  // A lead with zero memberships would vanish from the entire UI without a trace.
  it("re-adds to the default funnel when removing the last membership", () => {
    const plan = planRemoveFromFunnel({
      existing: [entry("catalisador", "cata-entrada")],
      entryId: "e-catalisador",
      defaultFunnel: geral,
      defaultFunnelStages: [geralEntry],
    });
    if (plan.action !== "remove") throw new Error("unreachable");
    expect(plan.movedToDefault).toBe(true);
    expect(plan.recreateInFunnelId).toBe("geral");
    expect(plan.recreateInStageId).toBe("geral-entrada");
  });

  it("is a no-op when the membership does not exist", () => {
    const plan = planRemoveFromFunnel({
      existing: [entry("geral", "geral-entrada")],
      entryId: "e-inexistente",
      defaultFunnel: geral,
      defaultFunnelStages: [geralEntry],
    });
    expect(plan.action).toBe("noop");
  });

  it("does not re-add when the last membership IS the default funnel", () => {
    const plan = planRemoveFromFunnel({
      existing: [entry("geral", "geral-entrada")],
      entryId: "e-geral",
      defaultFunnel: geral,
      defaultFunnelStages: [geralEntry],
    });
    expect(plan.action).toBe("error");
  });
});
