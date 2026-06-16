import { describe, expect, it } from "vitest";
import { costOfTokens } from "./aiPricing";

describe("costOfTokens", () => {
  const pricing = { inputPricePer1kUsd: 0.01, outputPricePer1kUsd: 0.03 };

  it("calcula custo em BRL a partir de tokens e câmbio", () => {
    // (1000/1000*0.01 + 1000/1000*0.03) = 0.04 USD * 5 = 0.20 BRL
    expect(costOfTokens(1000, 1000, pricing, 5)).toBeCloseTo(0.2, 5);
  });

  it("retorna 0 quando não há tokens", () => {
    expect(costOfTokens(0, 0, pricing, 5)).toBe(0);
  });

  it("escala proporcionalmente com tokens", () => {
    expect(costOfTokens(500, 0, pricing, 10)).toBeCloseTo(0.05, 5);
  });
});
