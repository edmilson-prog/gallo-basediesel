import { describe, expect, it } from "vitest";
import { filterByPilotGates, type IGateContext } from "./gates";

const esc = (conversationId: string) => ({ id: `esc-${conversationId}`, conversation_id: conversationId });

function gates(overrides: Partial<IGateContext> = {}): IGateContext {
  return {
    storeIdByConv: new Map([["conv-1", "store-on"]]),
    accountIdByConv: new Map([["conv-1", "acc-on"]]),
    enabledStoreIds: new Set(["store-on"]),
    enabledAccountIds: new Set(["acc-on"]),
    ...overrides,
  };
}

describe("filterByPilotGates", () => {
  it("passes an escalation whose store AND instance are in the pilot", () => {
    const result = filterByPilotGates([esc("conv-1")], gates());
    expect(result.passed.map((e) => e.conversation_id)).toEqual(["conv-1"]);
    expect(result.skippedCount).toBe(0);
  });

  it("skips when the store is not in the pilot", () => {
    const result = filterByPilotGates([esc("conv-1")], gates({ enabledStoreIds: new Set() }));
    expect(result.passed).toEqual([]);
    expect(result.skippedCount).toBe(1);
  });

  it("skips when the instance is not in the pilot", () => {
    const result = filterByPilotGates([esc("conv-1")], gates({ enabledAccountIds: new Set() }));
    expect(result.passed).toEqual([]);
    expect(result.skippedCount).toBe(1);
  });

  it("skips when the conversation has no instance or is unknown", () => {
    const noAccount = filterByPilotGates(
      [esc("conv-1")],
      gates({ accountIdByConv: new Map([["conv-1", null]]) }),
    );
    expect(noAccount.skippedCount).toBe(1);

    const unknownConv = filterByPilotGates([esc("conv-ghost")], gates());
    expect(unknownConv.skippedCount).toBe(1);
  });
});
