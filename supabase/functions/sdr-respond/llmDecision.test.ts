import { describe, expect, it } from "vitest";
import { parseSdrLlmDecision, VALID_HANDOFF_REASONS } from "./llmDecision";
// Relative import, not the "@/" alias: tsconfig.json's `include` scopes path-alias
// resolution to src/**, which excludes this directory (see vite-tsconfig-paths'
// per-importer include/exclude gate). Every other cross-file import in
// supabase/functions/ is relative for the same reason (Deno has no alias map).
import { ESCALATION_REASON_LABELS } from "../../../src/features/sdr-escalation/templates/render";

describe("parseSdrLlmDecision", () => {
  it("parses a valid 'continue' decision", () => {
    const raw = JSON.stringify({
      reply: "Oi! Sou o Fernando Gallo. Como posso te chamar?",
      action: "continue",
      collectedData: { preferredName: "João" },
    });
    expect(parseSdrLlmDecision(raw)).toEqual({
      reply: "Oi! Sou o Fernando Gallo. Como posso te chamar?",
      action: "continue",
      collectedData: { preferredName: "João" },
    });
  });

  it("parses a valid 'handoff' decision with a reason", () => {
    const raw = JSON.stringify({
      reply: "Vou te conectar com um vendedor.",
      action: "handoff",
      handoffReason: "qualified_handoff",
    });
    expect(parseSdrLlmDecision(raw)).toEqual({
      reply: "Vou te conectar com um vendedor.",
      action: "handoff",
      handoffReason: "qualified_handoff",
    });
  });

  it("parses a decision with no collectedData", () => {
    const raw = JSON.stringify({ reply: "Que horas vocês abrem?", action: "answer_faq" });
    expect(parseSdrLlmDecision(raw)).toEqual({
      reply: "Que horas vocês abrem?",
      action: "answer_faq",
    });
  });

  it("returns null for invalid JSON", () => {
    expect(parseSdrLlmDecision("not json{")).toBeNull();
  });

  it("returns null when reply is missing", () => {
    expect(parseSdrLlmDecision(JSON.stringify({ action: "continue" }))).toBeNull();
  });

  it("returns null for an unknown action", () => {
    expect(
      parseSdrLlmDecision(JSON.stringify({ reply: "oi", action: "sell_now" })),
    ).toBeNull();
  });

  it("returns null when action is 'handoff' without a handoffReason", () => {
    expect(
      parseSdrLlmDecision(JSON.stringify({ reply: "vou te conectar", action: "handoff" })),
    ).toBeNull();
  });

  it("returns null for an unknown handoffReason", () => {
    expect(
      parseSdrLlmDecision(
        JSON.stringify({ reply: "vou te conectar", action: "handoff", handoffReason: "porque_sim" }),
      ),
    ).toBeNull();
  });

  it("returns null when collectedData.preferredName is not a string", () => {
    expect(
      parseSdrLlmDecision(
        JSON.stringify({ reply: "oi", action: "continue", collectedData: { preferredName: 42 } }),
      ),
    ).toBeNull();
  });

  it("stays in lockstep with SdrEscalationReason (src/shared/types) — no drift between the two hand-maintained mirrors", () => {
    const denoSide = Array.from(VALID_HANDOFF_REASONS).sort();
    const sharedSide = Object.keys(ESCALATION_REASON_LABELS).sort();
    expect(denoSide).toEqual(sharedSide);
  });
});
