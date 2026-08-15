import { describe, expect, it } from "vitest";
import { normalizeFunnelLayout } from "./useFunnelLayoutPreference";

describe("normalizeFunnelLayout", () => {
  it("accepts the three known layouts", () => {
    expect(normalizeFunnelLayout("rail")).toBe("rail");
    expect(normalizeFunnelLayout("tabs")).toBe("tabs");
    expect(normalizeFunnelLayout("header")).toBe("header");
  });

  /**
   * localStorage is user-writable and survives deploys, so a value this build
   * does not know is a normal input, not an exception. Falling back keeps the
   * page rendering instead of trusting a string into a lookup.
   */
  it("falls back to the header switcher for anything else", () => {
    expect(normalizeFunnelLayout(null)).toBe("header");
    expect(normalizeFunnelLayout(undefined)).toBe("header");
    expect(normalizeFunnelLayout("")).toBe("header");
    expect(normalizeFunnelLayout("sidebar")).toBe("header");
    expect(normalizeFunnelLayout("RAIL")).toBe("header");
  });
});
