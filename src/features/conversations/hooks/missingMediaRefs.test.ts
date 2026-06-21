import { describe, it, expect } from "vitest";
import { missingMediaRefs } from "./useSeedSignedMediaUrls";

describe("missingMediaRefs", () => {
  it("returns distinct defined refs that are not yet cached", () => {
    const cached = new Set(["a"]);
    const result = missingMediaRefs(["a", "b", "b", undefined, "", "c"], (ref) => cached.has(ref));
    expect(result).toEqual(["b", "c"]);
  });

  it("returns empty when everything is cached", () => {
    expect(missingMediaRefs(["a", "a"], () => true)).toEqual([]);
  });
});
