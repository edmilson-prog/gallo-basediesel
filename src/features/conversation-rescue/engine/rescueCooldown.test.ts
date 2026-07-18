import { describe, it, expect } from "vitest";
import { isWithinRescueCooldown, RESCUE_REBROADCAST_COOLDOWN_MINUTES } from "./rescueCooldown";

const NOW = new Date("2026-07-18T17:00:00-03:00");
// A wait that started long before every entry below — epoch-neutral default.
const OLD_WAIT = "2026-07-18T08:00:00-03:00";

describe("isWithinRescueCooldown", () => {
  it("returns false when there are no prior rescues", () => {
    expect(isWithinRescueCooldown([], NOW, 60, OLD_WAIT)).toBe(false);
  });

  it("returns true for a claim resolved within the cooldown window", () => {
    const entries = [
      {
        claimedAt: "2026-07-18T16:30:00-03:00", // 30 min ago
        forcedAt: null,
        createdAt: "2026-07-18T16:25:00-03:00",
      },
    ];
    expect(isWithinRescueCooldown(entries, NOW, 60, OLD_WAIT)).toBe(true);
  });

  it("returns false once the cooldown has fully elapsed", () => {
    const entries = [
      {
        claimedAt: "2026-07-18T15:00:00-03:00", // 2h ago
        forcedAt: null,
        createdAt: "2026-07-18T14:55:00-03:00",
      },
    ];
    expect(isWithinRescueCooldown(entries, NOW, 60, OLD_WAIT)).toBe(false);
  });

  it("uses forcedAt when the rescue was force-assigned", () => {
    const entries = [
      {
        claimedAt: null,
        forcedAt: "2026-07-18T16:50:00-03:00", // 10 min ago
        createdAt: "2026-07-18T15:00:00-03:00", // 2h ago — must not win
      },
    ];
    expect(isWithinRescueCooldown(entries, NOW, 60, OLD_WAIT)).toBe(true);
  });

  it("falls back to createdAt for cancelled rows (no resolution timestamp)", () => {
    const recent = [{ claimedAt: null, forcedAt: null, createdAt: "2026-07-18T16:45:00-03:00" }];
    const old = [{ claimedAt: null, forcedAt: null, createdAt: "2026-07-18T14:00:00-03:00" }];
    expect(isWithinRescueCooldown(recent, NOW, 60, OLD_WAIT)).toBe(true);
    expect(isWithinRescueCooldown(old, NOW, 60, OLD_WAIT)).toBe(false);
  });

  it("any single recent entry among many old ones triggers the cooldown", () => {
    const entries = [
      { claimedAt: "2026-07-18T10:00:00-03:00", forcedAt: null, createdAt: "2026-07-18T09:55:00-03:00" },
      { claimedAt: null, forcedAt: "2026-07-18T16:59:00-03:00", createdAt: "2026-07-18T16:54:00-03:00" },
    ];
    expect(isWithinRescueCooldown(entries, NOW, 60, OLD_WAIT)).toBe(true);
  });

  it("boundary — an entry exactly at the cutoff does NOT trigger (strictly newer wins)", () => {
    const entries = [
      { claimedAt: "2026-07-18T16:00:00-03:00", forcedAt: null, createdAt: "2026-07-18T15:55:00-03:00" },
    ];
    expect(isWithinRescueCooldown(entries, NOW, 60, OLD_WAIT)).toBe(false);
  });

  it("a genuinely NEW wait (started after the rescue resolved) is never suppressed", () => {
    // Previous rescue cancelled at ~16:20 (createdAt floor), then the seller
    // replied, then the client sent a NEW question at 16:40.
    const entries = [
      { claimedAt: null, forcedAt: null, createdAt: "2026-07-18T16:20:00-03:00" },
    ];
    expect(isWithinRescueCooldown(entries, NOW, 60, "2026-07-18T16:40:00-03:00")).toBe(false);
  });

  it("the incident loop stays closed — a wait that PREdates the claim is suppressed", () => {
    // Old wait (08:00), claim at 16:45 without a reply: resolvedAt >= wait
    // start, inside the window → suppress the rebroadcast.
    const entries = [
      { claimedAt: "2026-07-18T16:45:00-03:00", forcedAt: null, createdAt: "2026-07-18T16:40:00-03:00" },
    ];
    expect(isWithinRescueCooldown(entries, NOW, 60, OLD_WAIT)).toBe(true);
  });

  it("exports a 60-minute default cooldown", () => {
    expect(RESCUE_REBROADCAST_COOLDOWN_MINUTES).toBe(60);
  });
});
