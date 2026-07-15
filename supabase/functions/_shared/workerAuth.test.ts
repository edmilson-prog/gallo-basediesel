import { describe, expect, it } from "vitest";
import { safeEqual, verifyWorkerSecret } from "./workerAuth";

describe("safeEqual", () => {
  it("returns true for identical strings", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(safeEqual("abc123", "abc124")).toBe(false);
  });

  it("returns false for strings of different lengths", () => {
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("returns false when either string is empty", () => {
    expect(safeEqual("", "abc")).toBe(false);
    expect(safeEqual("abc", "")).toBe(false);
  });
});

describe("verifyWorkerSecret", () => {
  it("returns true when provided matches expected", () => {
    expect(verifyWorkerSecret("secret", "secret")).toBe(true);
  });

  it("returns false when expected is undefined (secret not configured)", () => {
    expect(verifyWorkerSecret("secret", undefined)).toBe(false);
  });

  it("returns false when provided is empty", () => {
    expect(verifyWorkerSecret("", "secret")).toBe(false);
  });
});
