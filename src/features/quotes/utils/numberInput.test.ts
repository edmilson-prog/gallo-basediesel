// src/features/quotes/utils/numberInput.test.ts
import { describe, expect, it } from "vitest";
import { formatDecimalBR, parseDecimalBR } from "./numberInput";

describe("parseDecimalBR", () => {
  it("parses pt-BR notation with thousand separators", () => {
    expect(parseDecimalBR("1.289,90")).toBe(1289.9);
    expect(parseDecimalBR("12.345.678,90")).toBe(12345678.9);
  });

  it("parses plain decimals with a dot", () => {
    expect(parseDecimalBR("1289.90")).toBe(1289.9);
  });

  it("strips currency symbols and stray text", () => {
    expect(parseDecimalBR("R$ 1.289,90")).toBe(1289.9);
  });

  it("treats a lone comma or dot as the decimal separator", () => {
    expect(parseDecimalBR("38,9")).toBe(38.9);
    expect(parseDecimalBR("38.9")).toBe(38.9);
  });

  it("collapses empty, unparseable and negative input to zero", () => {
    expect(parseDecimalBR("")).toBe(0);
    expect(parseDecimalBR("abc")).toBe(0);
    expect(parseDecimalBR("-50")).toBe(0);
  });

  it("rounds to two decimals", () => {
    expect(parseDecimalBR("10,005")).toBe(10.01);
  });
});

describe("formatDecimalBR", () => {
  it("always renders two decimals in pt-BR", () => {
    expect(formatDecimalBR(1289.9)).toBe("1.289,90");
    expect(formatDecimalBR(0)).toBe("0,00");
  });

  it("round-trips through parseDecimalBR", () => {
    expect(parseDecimalBR(formatDecimalBR(3480))).toBe(3480);
  });
});
