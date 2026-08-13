import { describe, expect, it } from "vitest";
import { NPS_TARGET, npsBand, npsBandLabel, rulerPosition } from "./npsBand";

describe("npsBand", () => {
  it("names the four bands from the design kit", () => {
    expect(npsBand(-40)).toBe("critical");
    expect(npsBand(20)).toBe("improvement");
    expect(npsBand(60)).toBe("quality");
    expect(npsBand(80)).toBe("excellence");
  });

  it("places every boundary on the upper band", () => {
    expect(npsBand(0)).toBe("improvement");
    expect(npsBand(50)).toBe("quality");
    expect(npsBand(75)).toBe("excellence");
  });

  it("keeps the value just below a boundary in the lower band", () => {
    expect(npsBand(-1)).toBe("critical");
    expect(npsBand(49)).toBe("improvement");
    expect(npsBand(74)).toBe("quality");
  });

  it("handles the extremes", () => {
    expect(npsBand(-100)).toBe("critical");
    expect(npsBand(100)).toBe("excellence");
  });

  it("labels the bands in pt-BR", () => {
    expect(npsBandLabel(-40)).toBe("Crítica");
    expect(npsBandLabel(20)).toBe("Aperfeiçoamento");
    expect(npsBandLabel(60)).toBe("Qualidade");
    expect(npsBandLabel(80)).toBe("Excelência");
  });
});

describe("rulerPosition", () => {
  it("maps the -100..100 scale onto 0..100 percent", () => {
    expect(rulerPosition(-100)).toBe(0);
    expect(rulerPosition(0)).toBe(50);
    expect(rulerPosition(100)).toBe(100);
    expect(rulerPosition(60)).toBe(80);
  });

  it("clamps out-of-range input instead of overflowing the track", () => {
    expect(rulerPosition(-150)).toBe(0);
    expect(rulerPosition(150)).toBe(100);
  });
});

describe("NPS_TARGET", () => {
  it("is the internal goal the trend chart draws its dashed line at", () => {
    expect(NPS_TARGET).toBe(60);
  });
});
