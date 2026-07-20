import { describe, it, expect } from "vitest";
import { createSoundPlayer } from "./soundPlayer";

// jsdom/node have no AudioContext → the player degrades to a safe no-op.
describe("createSoundPlayer (no Web Audio)", () => {
  it("never throws for any method", () => {
    const p = createSoundPlayer();
    expect(() => p.unlock()).not.toThrow();
    expect(() => p.play("updateAvailable", undefined)).not.toThrow();
    expect(() => p.playTemplate("marimba", 0.5)).not.toThrow();
    expect(() => p.dispose()).not.toThrow();
  });
});
