import { describe, it, expect } from "vitest";
import {
  classifyOrphan,
  VITALITY_WINDOW_DAYS,
  IMPORT_LOSS_REASON,
  type IOrphanInput,
} from "./orphanClassification";

const NOW = "2026-06-15T12:00:00.000Z";

function baseInput(overrides: Partial<IOrphanInput> = {}): IOrphanInput {
  return {
    hasConversation: false,
    lastMessageAt: null,
    hasManualData: false,
    hasCommercialRelation: false,
    ...overrides,
  };
}

describe("classifyOrphan", () => {
  it("exports the vitality window as 7 days", () => {
    expect(VITALITY_WINDOW_DAYS).toBe(7);
  });

  it("classifies as review when hasCommercialRelation is true, even without a conversation", () => {
    const input = baseInput({ hasCommercialRelation: true });
    expect(classifyOrphan(input, NOW)).toBe("review");
  });

  it("classifies as review when hasManualData is true, even without a conversation", () => {
    const input = baseInput({ hasManualData: true });
    expect(classifyOrphan(input, NOW)).toBe("review");
  });

  it("review takes precedence over an active conversation (guard test)", () => {
    const input = baseInput({
      hasConversation: true,
      lastMessageAt: NOW,
      hasCommercialRelation: true,
    });
    expect(classifyOrphan(input, NOW)).toBe("review");
  });

  it("classifies as delete when there is no conversation and no review guard applies", () => {
    const input = baseInput();
    expect(classifyOrphan(input, NOW)).toBe("delete");
  });

  it("classifies as lead_dormente when lastMessageAt is null but hasConversation is true (dead history)", () => {
    const input = baseInput({ hasConversation: true, lastMessageAt: null });
    expect(classifyOrphan(input, NOW)).toBe("lead_dormente");
  });

  it("classifies as lead_ativo when the last message is well within the 7-day window", () => {
    const input = baseInput({ hasConversation: true, lastMessageAt: "2026-06-14T12:00:00.000Z" });
    expect(classifyOrphan(input, NOW)).toBe("lead_ativo");
  });

  it("classifies as lead_ativo at the exact 7-day boundary (inclusive)", () => {
    const input = baseInput({ hasConversation: true, lastMessageAt: "2026-06-08T12:00:00.000Z" });
    expect(classifyOrphan(input, NOW)).toBe("lead_ativo");
  });

  it("classifies as lead_dormente just 1ms past the 7-day boundary", () => {
    const input = baseInput({ hasConversation: true, lastMessageAt: "2026-06-08T11:59:59.999Z" });
    expect(classifyOrphan(input, NOW)).toBe("lead_dormente");
  });

  it("classifies as lead_dormente when the last message is well outside the 7-day window", () => {
    const input = baseInput({ hasConversation: true, lastMessageAt: "2026-01-01T00:00:00.000Z" });
    expect(classifyOrphan(input, NOW)).toBe("lead_dormente");
  });

  it("exports the import loss reason constant verbatim", () => {
    expect(IMPORT_LOSS_REASON).toBe("Importado sem interação");
  });
});
