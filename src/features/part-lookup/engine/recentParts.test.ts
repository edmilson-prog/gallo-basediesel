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
    expect(out).toEqual(["new", "id0", "id1", "id2", "id3", "id4", "id5", "id6"]);
  });
});

describe("parseRecent", () => {
  it("returns [] for null/invalid json", () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent("{bad")).toEqual([]);
  });
  it("returns [] for valid non-array json", () => {
    expect(parseRecent('{"a":1}')).toEqual([]);
    expect(parseRecent("42")).toEqual([]);
  });
  it("keeps only string entries", () => {
    expect(parseRecent(JSON.stringify(["a", 2, "b"]))).toEqual(["a", "b"]);
  });
});
