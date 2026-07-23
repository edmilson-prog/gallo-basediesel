import { describe, expect, it } from "vitest";
import type { ILeadFunnelEntry, ILeadFunnelStage } from "@/shared/types";
import { planStageTransition } from "./stageTransition";

function stage(id: string, kind: ILeadFunnelStage["kind"] = "aberta"): ILeadFunnelStage {
  return {
    id, funnelId: "catalisador", name: id, accent: 0, position: 0, kind,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
function entry(over: Partial<ILeadFunnelEntry> = {}): ILeadFunnelEntry {
  return {
    id: "e-1", leadId: "lead-1", funnelId: "catalisador", stageId: "aberta-1",
    storeId: "store-1", sellerId: "seller-1", enteredStageAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over,
  };
}

describe("planStageTransition", () => {
  it("moves plainly between open stages", () => {
    const plan = planStageTransition({
      entry: entry(), target: stage("negociacao"), siblingEntries: [],
    });
    expect(plan.action).toBe("move");
  });

  it("is a no-op when the target is the current stage", () => {
    const plan = planStageTransition({
      entry: entry({ stageId: "negociacao" }), target: stage("negociacao"), siblingEntries: [],
    });
    expect(plan.action).toBe("noop");
  });

  it("requires conversion when entering a won stage", () => {
    const plan = planStageTransition({
      entry: entry(), target: stage("convertido", "ganho"), siblingEntries: [],
    });
    expect(plan.action).toBe("require_conversion");
    if (plan.action !== "require_conversion") throw new Error("unreachable");
    expect(plan.linkToCustomerId).toBeUndefined();
  });

  // Without this the second conversion opens the modal in "new" mode and
  // creates a SECOND customer for the same person.
  it("links to the existing customer when another membership already converted", () => {
    const plan = planStageTransition({
      entry: entry(),
      target: stage("convertido", "ganho"),
      siblingEntries: [entry({ id: "e-2", funnelId: "filtros", convertedToCustomerId: "cust-9" })],
    });
    if (plan.action !== "require_conversion") throw new Error("unreachable");
    expect(plan.linkToCustomerId).toBe("cust-9");
  });

  it("requires a loss reason when entering a lost stage", () => {
    const plan = planStageTransition({
      entry: entry(), target: stage("perdido", "perda"), siblingEntries: [],
    });
    expect(plan.action).toBe("require_loss_reason");
  });

  it("allows reopening a closed membership back into an open stage", () => {
    const plan = planStageTransition({
      entry: entry({ stageId: "perdido", lossReason: "Preço" }),
      target: stage("negociacao"),
      siblingEntries: [],
    });
    expect(plan.action).toBe("move");
    if (plan.action !== "move") throw new Error("unreachable");
    expect(plan.clearOutcome).toBe(true);
  });

  it("rejects a stage from another funnel", () => {
    const foreign: ILeadFunnelStage = { ...stage("de-outro"), funnelId: "filtros" };
    const plan = planStageTransition({ entry: entry(), target: foreign, siblingEntries: [] });
    expect(plan.action).toBe("error");
  });
});
