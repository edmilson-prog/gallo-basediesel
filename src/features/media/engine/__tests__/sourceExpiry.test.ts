import { describe, expect, it } from "vitest";
import {
  computeSourceExpiresAt,
  daysUntilExpiry,
  expiryLabel,
  expiryUrgency,
  sourceExpiry,
} from "../sourceExpiry";

const NOW = new Date("2026-06-05T12:00:00.000Z");

describe("computeSourceExpiresAt", () => {
  it("adds the given window (default 30d) to createdAt", () => {
    expect(computeSourceExpiresAt("2026-06-05T12:00:00.000Z", 30)).toBe(
      "2026-07-05T12:00:00.000Z",
    );
  });
});

describe("daysUntilExpiry", () => {
  it("counts whole days from now (ceil)", () => {
    expect(daysUntilExpiry("2026-06-06T12:00:00.000Z", NOW)).toBe(1);
    expect(daysUntilExpiry("2026-06-20T12:00:00.000Z", NOW)).toBe(15);
  });
  it("returns null when undefined", () => {
    expect(daysUntilExpiry(undefined, NOW)).toBeNull();
  });
  it("returns 0 or negative when already expired", () => {
    expect(daysUntilExpiry("2026-06-04T12:00:00.000Z", NOW)).toBeLessThanOrEqual(0);
  });
});

describe("expiryLabel", () => {
  it("formats 'expira em Nd'", () => {
    expect(expiryLabel("2026-06-20T12:00:00.000Z", NOW)).toBe("expira em 15d");
    expect(expiryLabel("2026-06-06T12:00:00.000Z", NOW)).toBe("expira em 1d");
  });
  it("formats 'expirada' once past", () => {
    expect(expiryLabel("2026-06-04T12:00:00.000Z", NOW)).toBe("expirada");
  });
  it("returns null when there is no expiry", () => {
    expect(expiryLabel(undefined, NOW)).toBeNull();
  });
});

describe("expiryUrgency", () => {
  it("tiers by remaining days: >14 soft, <=7 strong, <=2 critical", () => {
    expect(expiryUrgency("2026-06-25T12:00:00.000Z", NOW)).toBe("soft"); // 20d
    expect(expiryUrgency("2026-06-15T12:00:00.000Z", NOW)).toBe("soft"); // 10d? -> >7 => soft
    expect(expiryUrgency("2026-06-11T12:00:00.000Z", NOW)).toBe("strong"); // 6d
    expect(expiryUrgency("2026-06-07T12:00:00.000Z", NOW)).toBe("critical"); // 2d
    expect(expiryUrgency("2026-06-04T12:00:00.000Z", NOW)).toBe("critical"); // expired
  });
  it("returns 'none' when there is no expiry", () => {
    expect(expiryUrgency(undefined, NOW)).toBe("none");
  });
});

describe("sourceExpiry (convenience view-model consumed by Plan B)", () => {
  it("aggregates daysLeft + label + tier, using the word 'strong' (never 'solid')", () => {
    expect(sourceExpiry({ sourceExpiresAt: "2026-06-11T12:00:00.000Z" }, NOW)).toEqual({
      daysLeft: 6,
      label: "expira em 6d",
      tier: "strong",
    });
    expect(sourceExpiry({ sourceExpiresAt: "2026-06-07T12:00:00.000Z" }, NOW).tier).toBe("critical");
    expect(sourceExpiry({ sourceExpiresAt: "2026-06-25T12:00:00.000Z" }, NOW).tier).toBe("soft");
  });
  it("degrades gracefully when the asset has no source expiry", () => {
    expect(sourceExpiry({}, NOW)).toEqual({ daysLeft: 0, label: "", tier: "soft" });
  });
});
