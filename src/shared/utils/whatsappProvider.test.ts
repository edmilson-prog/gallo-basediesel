import { describe, expect, it } from "vitest";
import { isEvolutionFamily } from "./whatsappProvider";

describe("isEvolutionFamily", () => {
  it("is true for evolution", () => {
    expect(isEvolutionFamily("evolution")).toBe(true);
  });
  it("is true for evolution-go", () => {
    expect(isEvolutionFamily("evolution-go")).toBe(true);
  });
  it("is false for meta", () => {
    expect(isEvolutionFamily("meta")).toBe(false);
  });
});
