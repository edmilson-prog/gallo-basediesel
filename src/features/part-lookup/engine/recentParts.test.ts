import { describe, it, expect } from "vitest";
import { pushRecent, parseRecent, RECENT_CAP } from "./recentParts";

describe("pushRecent", () => {
  it("prepends new id", () => {
    expect(pushRecent(["b"], "a")).toEqual(["a", "b"]);
  });
  it("dedupes, moving existing id to front", () => {
    expect(pushRecent(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
  });
  it("caps the list length", () => {
    const long = Array.from({ length: RECENT_CAP }, (_, i) => `id${i}`);
    const out = pushRecent(long, "new");
    expect(out.length).toBe(RECENT_CAP);
    expect(out[0]).toBe("new");
  });
});

describe("parseRecent", () => {
  it("returns [] for null/invalid json", () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent("{bad")).toEqual([]);
  });
  it("keeps only string entries", () => {
    expect(parseRecent(JSON.stringify(["a", 2, "b"]))).toEqual(["a", "b"]);
  });
});
