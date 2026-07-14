import { describe, expect, it } from "vitest";
import { enforceSdrGuardrails } from "./enforceGuardrails";
import type { ISdrLlmDecision } from "./llmDecision";

describe("enforceSdrGuardrails", () => {
  it("passes through a clean 'continue' decision unchanged", () => {
    const decision: ISdrLlmDecision = {
      reply: "Legal! De onde você é?",
      action: "continue",
      collectedData: { preferredName: "João" },
    };
    expect(enforceSdrGuardrails(decision)).toEqual(decision);
  });

  it("overrides a reply that mentions a price, forcing a handoff", () => {
    const decision: ISdrLlmDecision = {
      reply: "Esse filtro sai por R$ 95,00",
      action: "answer_faq",
    };
    const result = enforceSdrGuardrails(decision);
    expect(result.action).toBe("handoff");
    expect(result.handoffReason).toBe("out_of_scope");
    expect(result.reply).not.toContain("R$");
  });

  it("overrides a reply that offers a discount even if the model said 'continue'", () => {
    const decision: ISdrLlmDecision = {
      reply: "Consigo um desconto especial pra você",
      action: "continue",
    };
    const result = enforceSdrGuardrails(decision);
    expect(result.action).toBe("handoff");
    expect(result.handoffReason).toBe("out_of_scope");
  });

  it("preserves collectedData when overriding", () => {
    const decision: ISdrLlmDecision = {
      reply: "O frete é R$ 20",
      action: "continue",
      collectedData: { preferredName: "Maria", location: "Frederico Westphalen" },
    };
    const result = enforceSdrGuardrails(decision);
    expect(result.collectedData).toEqual({ preferredName: "Maria", location: "Frederico Westphalen" });
  });

  it("does not flag a clean handoff decision", () => {
    const decision: ISdrLlmDecision = {
      reply: "Vou te conectar com um vendedor pra fechar os detalhes.",
      action: "handoff",
      handoffReason: "customer_requested",
    };
    expect(enforceSdrGuardrails(decision)).toEqual(decision);
  });

  it("overrides a 'close' decision that mentions a price", () => {
    const decision: ISdrLlmDecision = {
      reply: "Fechado! O valor é R$ 200,00.",
      action: "close",
    };
    const result = enforceSdrGuardrails(decision);
    expect(result.action).toBe("handoff");
    expect(result.handoffReason).toBe("out_of_scope");
    expect(result.reply).not.toContain("R$");
  });

  it("overrides a 'handoff' decision whose own reply mentions a discount, proving handoff gets no free pass", () => {
    const decision: ISdrLlmDecision = {
      reply: "Vou te conectar com um vendedor, e já consigo um desconto de 10%.",
      action: "handoff",
      handoffReason: "customer_requested",
    };
    const result = enforceSdrGuardrails(decision);
    expect(result.action).toBe("handoff");
    expect(result.handoffReason).toBe("out_of_scope");
    expect(result.reply).not.toContain("desconto");
  });
});
