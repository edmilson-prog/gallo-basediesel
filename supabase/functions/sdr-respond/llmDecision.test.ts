import { describe, expect, it } from "vitest";
import { parseSdrLlmDecision } from "./llmDecision";

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
});
