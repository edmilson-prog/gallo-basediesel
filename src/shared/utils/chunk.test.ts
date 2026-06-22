import { describe, expect, it } from "vitest";
import { chunk } from "./chunk";

describe("chunk", () => {
  it("splits into consecutive batches of at most `size`", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("splits evenly when length is a multiple of size", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it("returns an empty array for empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("returns a single chunk when size >= length", () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  it("handles size of 1", () => {
    expect(chunk(["a", "b", "c"], 1)).toEqual([["a"], ["b"], ["c"]]);
  });

  it("throws when size <= 0", () => {
    expect(() => chunk([1, 2], 0)).toThrow("chunk: size must be > 0");
    expect(() => chunk([1, 2], -1)).toThrow("chunk: size must be > 0");
  });

  it("preserves element identity (no element copies)", () => {
    const a = { id: 1 };
    const b = { id: 2 };
    const out = chunk([a, b], 1);
    expect(out[0][0]).toBe(a);
    expect(out[1][0]).toBe(b);
  });
});
