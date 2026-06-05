import { describe, expect, it } from "vitest";
import { denormalizePoint, normalizePoint } from "../annotationCoords";

const BOX = { width: 800, height: 600 };

describe("normalizePoint", () => {
  it("maps pixels to 0..1", () => {
    expect(normalizePoint({ x: 400, y: 300 }, BOX)).toEqual({ x: 0.5, y: 0.5 });
    expect(normalizePoint({ x: 0, y: 0 }, BOX)).toEqual({ x: 0, y: 0 });
    expect(normalizePoint({ x: 800, y: 600 }, BOX)).toEqual({ x: 1, y: 1 });
  });
  it("clamps out-of-bounds pixels into 0..1", () => {
    expect(normalizePoint({ x: -50, y: 9999 }, BOX)).toEqual({ x: 0, y: 1 });
  });
  it("returns 0 for a zero-sized box (no division by zero)", () => {
    expect(normalizePoint({ x: 10, y: 10 }, { width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe("denormalizePoint", () => {
  it("maps 0..1 back to pixels", () => {
    expect(denormalizePoint({ x: 0.5, y: 0.5 }, BOX)).toEqual({ x: 400, y: 300 });
  });
});

describe("round-trip is idempotent (within fp tolerance)", () => {
  it("normalize -> denormalize -> normalize is stable", () => {
    const px = { x: 123, y: 456 };
    const once = normalizePoint(px, BOX);
    const back = denormalizePoint(once, BOX);
    const twice = normalizePoint(back, BOX);
    expect(twice.x).toBeCloseTo(once.x, 10);
    expect(twice.y).toBeCloseTo(once.y, 10);
  });
});
