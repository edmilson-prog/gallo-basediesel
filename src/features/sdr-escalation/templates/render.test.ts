import { describe, expect, it } from "vitest";
import { ESCALATION_REASON_LABELS } from "./render";

describe("ESCALATION_REASON_LABELS", () => {
  it("has a non-empty label for every existing reason", () => {
    for (const reason of [
      "customer_requested",
      "negotiation_detected",
      "sdr_failed",
      "complexity",
      "out_of_scope",
    ] as const) {
      expect(ESCALATION_REASON_LABELS[reason]).toBeTypeOf("string");
      expect(ESCALATION_REASON_LABELS[reason].length).toBeGreaterThan(0);
    }
  });

  it("has a label for the new qualified_handoff reason (normal triage handoff, not an exception)", () => {
    const labels = ESCALATION_REASON_LABELS as Record<string, string>;
    expect(labels.qualified_handoff).toBeTypeOf("string");
    expect(labels.qualified_handoff.length).toBeGreaterThan(0);
  });
});
