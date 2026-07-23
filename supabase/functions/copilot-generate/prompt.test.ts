import { describe, expect, it } from "vitest";
import { buildReplyPrompt, type PromptMessage } from "./prompt";

const msg = (over: Partial<PromptMessage> = {}): PromptMessage => ({
  direction: "in",
  authorType: "customer",
  text: "oi",
  sentAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("buildReplyPrompt", () => {
  it("retorna '' sem mensagens com texto", () => {
    expect(buildReplyPrompt({ messages: [] })).toBe("");
    expect(buildReplyPrompt({ messages: [msg({ text: "   " })] })).toBe("");
  });

  it("retorna '' quando não há mensagem do cliente", () => {
    expect(
      buildReplyPrompt({ messages: [msg({ direction: "out", authorType: "seller", text: "olá" })] }),
    ).toBe("");
  });

  it("rotula Cliente/Vendedor e inclui a instrução final", () => {
    const out = buildReplyPrompt({
      messages: [
        msg({ text: "qual o prazo de entrega?" }),
        msg({ direction: "out", authorType: "seller", text: "vou verificar" }),
      ],
    });
    expect(out).toContain("Cliente: qual o prazo de entrega?");
    expect(out).toContain("Vendedor: vou verificar");
    expect(out).toContain("português do Brasil");
  });

  it("limita às últimas N mensagens", () => {
    const messages = Array.from({ length: 40 }, (_, i) => msg({ text: `linha${i}` }));
    const out = buildReplyPrompt({ messages, maxMessages: 5 });
    expect(out).toContain("linha39");
    expect(out).toContain("linha35"); // first message of the last-5 slice (guards off-by-one)
    expect(out).not.toContain("linha34");
  });

  it("inclui o nome do cliente quando fornecido", () => {
    const out = buildReplyPrompt({ messages: [msg({ text: "oi" })], customer: { name: "João", type: "B2C" } });
    expect(out).toContain("Cliente: João");
  });

  it("trunca por maxChars descartando a primeira linha parcial", () => {
    const messages = [
      msg({ text: "A".repeat(120) }),
      msg({ direction: "out", authorType: "seller", text: "resposta recente" }),
    ];
    const out = buildReplyPrompt({ messages, maxChars: 40 });
    expect(out).toContain("Vendedor: resposta recente");
    expect(out).not.toContain("AAAA"); // a linha longa parcial foi removida
  });

  it("rotula SDR quando authorType é sdr", () => {
    const out = buildReplyPrompt({
      messages: [
        msg({ text: "tenho interesse" }),
        msg({ direction: "out", authorType: "sdr", text: "posso te ajudar" }),
      ],
    });
    expect(out).toContain("SDR: posso te ajudar");
  });

  it("usa as mensagens MAIS RECENTES quando há mais que a janela", () => {
    const messages = Array.from({ length: 60 }, (_, i) => ({
      direction: (i % 2 === 0 ? "in" : "out") as "in" | "out",
      authorType: i % 2 === 0 ? "customer" : "seller",
      text: `mensagem ${i}`,
      sentAt: `2026-07-${String((i % 28) + 1).padStart(2, "0")}T10:00:00Z`,
    }));

    const prompt = buildReplyPrompt({ messages, maxMessages: 30 });

    expect(prompt).toContain("mensagem 59");
    expect(prompt).not.toContain("mensagem 0");
  });

  it("honra um maxMessages explícito maior que o default de 30 (janela configurável)", () => {
    const messages = Array.from({ length: 50 }, (_, i) => msg({ text: `msg${i}` }));

    // With the default (30) this older message would be dropped; with an
    // explicit maxMessages of 50 (e.g. a store's configured window) it must
    // survive — this is what guards the Edge Function wiring windowSize through.
    const prompt = buildReplyPrompt({ messages, maxMessages: 50 });

    expect(prompt).toContain("msg0"); // oldest message, only kept by the wider window
    expect(prompt).toContain("msg49");

    const defaultPrompt = buildReplyPrompt({ messages });
    expect(defaultPrompt).not.toContain("msg0"); // sanity: default 30-cap really does drop it
  });
});
