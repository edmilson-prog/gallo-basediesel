import { describe, expect, it } from "vitest";
import { clampStep, nextStep, prevStep, isFirstStep, isLastStep } from "./tourNavigation";

describe("tourNavigation", () => {
  it("clamps an index into [0, stepCount-1]", () => {
    expect(clampStep(-5, 4)).toBe(0);
    expect(clampStep(10, 4)).toBe(3);
    expect(clampStep(2, 4)).toBe(2);
  });

  it("advances but stops at the last step", () => {
    expect(nextStep(0, 4)).toBe(1);
    expect(nextStep(3, 4)).toBe(3);
  });

  it("goes back but stops at the first step", () => {
    expect(prevStep(2, 4)).toBe(1);
    expect(prevStep(0, 4)).toBe(0);
  });

  it("knows the boundaries", () => {
    expect(isFirstStep(0)).toBe(true);
    expect(isFirstStep(1)).toBe(false);
    expect(isLastStep(3, 4)).toBe(true);
    expect(isLastStep(2, 4)).toBe(false);
  });
});
