import { describe, expect, it } from "vitest";
import { buildSparklinePath } from "../Sparkline";

describe("buildSparklinePath", () => {
  it("retorna null com menos de 2 pontos", () => {
    expect(buildSparklinePath([], 100, 24)).toBeNull();
    expect(buildSparklinePath([5], 100, 24)).toBeNull();
  });
  it("mapeia série crescente para coordenadas válidas", () => {
    const d = buildSparklinePath([0, 5, 10], 100, 24);
    expect(d).toMatch(/^M /);
    // primeiro ponto em x=0; último ponto em x=width
    expect(d!.includes("M 0")).toBe(true);
    expect(d!.includes("100")).toBe(true);
  });
  it("série constante não quebra (sem divisão por zero)", () => {
    const d = buildSparklinePath([7, 7, 7], 100, 24);
    expect(d).toMatch(/^M /);
  });
});
