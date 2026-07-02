import { describe, expect, it } from "vitest";
import { createTonePlayer } from "./tonePlayer";

// jsdom does not expose AudioContext → the player must degrade to a no-op
// without throwing.
describe("createTonePlayer", () => {
  it("returns a no-op player when Web Audio is unavailable", () => {
    const player = createTonePlayer();
    expect(() => player.unlock()).not.toThrow();
    expect(() => player.play("assigned-mine", 0.5)).not.toThrow();
    expect(() => player.play("new-in-queue", 0.5)).not.toThrow();
    expect(() => player.dispose()).not.toThrow();
  });
});
