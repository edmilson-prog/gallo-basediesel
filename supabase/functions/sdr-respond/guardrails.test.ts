import { describe, expect, it } from "vitest";
import { containsCommercialValue } from "./guardrails";

describe("containsCommercialValue", () => {
  it("flags an explicit currency amount", () => {
    expect(containsCommercialValue("o filtro custa R$ 95,00")).toBe(true);
  });

  it("flags the word 'desconto'", () => {
    expect(containsCommercialValue("posso te dar um desconto")).toBe(true);
  });

  it("flags a percentage", () => {
    expect(containsCommercialValue("consigo 10% a menos")).toBe(true);
  });

  it("flags 'frete'", () => {
    expect(containsCommercialValue("o frete sai grátis")).toBe(true);
  });

  it("flags a delivery deadline mention (prazo)", () => {
    expect(containsCommercialValue("o prazo de entrega é rápido")).toBe(true);
  });

  it("flags a delivery deadline mention (dias úteis)", () => {
    expect(containsCommercialValue("chega em 5 dias úteis")).toBe(true);
  });

  it("flags a unit-price mention", () => {
    expect(containsCommercialValue("o valor unitário é 30 reais")).toBe(true);
  });

  it("does not flag a plain qualification question", () => {
    expect(containsCommercialValue("qual o seu nome, pra eu te chamar certinho?")).toBe(false);
  });

  it("does not flag a non-monetary FAQ answer", () => {
    expect(
      containsCommercialValue("atendemos de segunda a sexta, das 8h às 18h"),
    ).toBe(false);
  });

  it("does not flag a plain business-hours mention without a numeric lead time", () => {
    expect(containsCommercialValue("Atendemos em dias úteis, das 8h às 18h")).toBe(false);
  });
});
