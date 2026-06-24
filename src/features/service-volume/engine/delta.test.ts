import { describe, expect, it } from "vitest";
import { deltaPct } from "./delta";

describe("deltaPct", () => {
  it("crescimento positivo arredondado", () => {
    expect(deltaPct(110, 100)).toBe(10);
  });
  it("queda negativa", () => {
    expect(deltaPct(90, 100)).toBe(-10);
  });
  it("previous=0 → null (sem base de comparação)", () => {
    expect(deltaPct(50, 0)).toBeNull();
  });
  it("arredonda para inteiro", () => {
    expect(deltaPct(133, 100)).toBe(33);
  });
});
