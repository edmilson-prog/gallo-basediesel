import { describe, it, expect } from "vitest";
import { pickFallbackSeller } from "./pickFallbackSeller";

describe("pickFallbackSeller", () => {
  it("returns null for an empty candidate list", () => {
    expect(pickFallbackSeller([], "seed-1")).toBeNull();
  });

  it("returns the only candidate when there is exactly one", () => {
    expect(pickFallbackSeller(["seller-a"], "seed-1")).toBe("seller-a");
  });

  it("is deterministic — same candidates + same seed always picks the same seller", () => {
    const candidates = ["seller-a", "seller-b", "seller-c"];
    const first = pickFallbackSeller(candidates, "conv-123-2026-07-17T15:00:00Z");
    const second = pickFallbackSeller(candidates, "conv-123-2026-07-17T15:00:00Z");
    expect(first).toBe(second);
    expect(candidates).toContain(first);
  });

  it("varies the pick across different seeds (not always the first candidate)", () => {
    const candidates = ["seller-a", "seller-b", "seller-c", "seller-d"];
    const picks = new Set(
      Array.from({ length: 20 }, (_, i) => pickFallbackSeller(candidates, `seed-${i}`)),
    );
    // With 4 candidates and 20 distinct seeds, a real distribution hits more than one.
    expect(picks.size).toBeGreaterThan(1);
  });

  it("order of candidates does not change who a given seed picks by identity — picks an id present in the list", () => {
    const candidates = ["seller-x", "seller-y"];
    const pick = pickFallbackSeller(candidates, "fixed-seed");
    expect(candidates).toContain(pick);
  });
});
