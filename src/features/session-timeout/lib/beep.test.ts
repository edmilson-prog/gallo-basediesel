import { describe, expect, it } from "vitest";
import { createBeeper } from "./beep";

// jsdom não expõe AudioContext → o beeper deve virar no-op sem lançar.
describe("createBeeper", () => {
  it("returns a no-op beeper when Web Audio is unavailable", () => {
    const beeper = createBeeper();
    expect(() => beeper.unlock()).not.toThrow();
    expect(() => beeper.beep(0.5, 0.5)).not.toThrow();
  });
});
