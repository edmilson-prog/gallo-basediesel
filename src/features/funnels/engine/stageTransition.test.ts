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
    expect(plan.clearLossOutcome).toBe(false);
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
    if (plan.action !== "require_loss_reason") throw new Error("unreachable");
    expect(plan.clearWonOutcome).toBe(false);
  });

  // Finding 14: dragging an already-lost entry onto a won stage must instruct
  // the caller to clear the OLD outcome, or the membership ends up with both
  // convertedToCustomerId AND lossReason set — every "is lost" predicate in
  // the codebase keys off lossReason !== undefined, so a WON opportunity
  // would be reported as lost.
  it("instructs the caller to clear the loss outcome when a lost entry converts (perda -> ganho)", () => {
    const plan = planStageTransition({
      entry: entry({ stageId: "perdido", lossReason: "Preço", lossNotes: "Concorrente mais barato" }),
      target: stage("convertido", "ganho"),
      siblingEntries: [],
    });
    expect(plan.action).toBe("require_conversion");
    if (plan.action !== "require_conversion") throw new Error("unreachable");
    expect(plan.clearLossOutcome).toBe(true);
  });

  // Mirror case: a converted entry dragged onto Perdido must clear
  // convertedToCustomerId, or the membership stays linked to a customer while
  // also carrying a loss reason.
  it("instructs the caller to clear the won outcome when a converted entry is lost (ganho -> perda)", () => {
    const plan = planStageTransition({
      entry: entry({ stageId: "convertido", convertedToCustomerId: "cust-1" }),
      target: stage("perdido", "perda"),
      siblingEntries: [],
    });
    expect(plan.action).toBe("require_loss_reason");
    if (plan.action !== "require_loss_reason") throw new Error("unreachable");
    expect(plan.clearWonOutcome).toBe(true);
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
