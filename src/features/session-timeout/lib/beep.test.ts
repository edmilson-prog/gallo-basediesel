import { describe, expect, it } from "vitest";
import { createBeeper } from "./beep";

// jsdom does not expose AudioContext → the beeper must become a no-op without throwing.
describe("createBeeper", () => {
  it("returns a no-op beeper when Web Audio is unavailable", () => {
    const beeper = createBeeper();
    expect(() => beeper.unlock()).not.toThrow();
    expect(() => beeper.beep(0.5, 0.5)).not.toThrow();
  });
});
