import { describe, expect, it } from "vitest";
import {
  AVATAR_MAX_ZOOM,
  AVATAR_MIN_ZOOM,
  clampOffset,
  clampZoom,
  coverScale,
  cropRect,
  offsetForZoom,
  renderedSize,
} from "./avatarCrop";

const VIEWPORT = 200;
/** Landscape photo: the height is the limiting side. */
const LANDSCAPE = { width: 400, height: 200 };
/** Portrait photo: the width is the limiting side. */
const PORTRAIT = { width: 200, height: 800 };
const SQUARE = { width: 400, height: 400 };

describe("coverScale", () => {
  it("scales a landscape photo by its shorter side", () => {
    expect(coverScale(LANDSCAPE, VIEWPORT)).toBe(1);
  });

  it("scales a portrait photo by its shorter side", () => {
    expect(coverScale(PORTRAIT, VIEWPORT)).toBe(1);
  });

  it("upscales a photo smaller than the viewport so it still covers", () => {
    expect(coverScale({ width: 100, height: 50 }, VIEWPORT)).toBe(4);
  });

  it("falls back to 1 on degenerate input instead of dividing by zero", () => {
    expect(coverScale({ width: 0, height: 0 }, VIEWPORT)).toBe(1);
    expect(coverScale(SQUARE, 0)).toBe(1);
  });
});

describe("renderedSize", () => {
  it("always covers the viewport at zoom 1", () => {
    const size = renderedSize(LANDSCAPE, VIEWPORT, 1);
    expect(size.width).toBeGreaterThanOrEqual(VIEWPORT);
    expect(size.height).toBeGreaterThanOrEqual(VIEWPORT);
  });

  it("grows proportionally with the zoom", () => {
    const size = renderedSize(SQUARE, VIEWPORT, 2);
    expect(size).toEqual({ width: VIEWPORT * 2, height: VIEWPORT * 2 });
  });
});

describe("clampZoom", () => {
  it("keeps the zoom inside the allowed range", () => {
    expect(clampZoom(0.1)).toBe(AVATAR_MIN_ZOOM);
    expect(clampZoom(99)).toBe(AVATAR_MAX_ZOOM);
    expect(clampZoom(1.5)).toBe(1.5);
  });

  it("falls back to the minimum on NaN", () => {
    expect(clampZoom(Number.NaN)).toBe(AVATAR_MIN_ZOOM);
  });
});

describe("clampOffset", () => {
  it("pins a square photo at zoom 1 — there is nothing to pan", () => {
    expect(clampOffset({ x: 50, y: -50 }, SQUARE, VIEWPORT, 1)).toEqual({ x: 0, y: 0 });
  });

  it("allows panning only along the overflowing axis", () => {
    // 400x200 at cover scale 1 overflows 200px horizontally, nothing vertically.
    expect(clampOffset({ x: 500, y: 500 }, LANDSCAPE, VIEWPORT, 1)).toEqual({ x: 100, y: 0 });
    expect(clampOffset({ x: -500, y: -500 }, LANDSCAPE, VIEWPORT, 1)).toEqual({ x: -100, y: 0 });
  });

  it("leaves an in-range offset untouched", () => {
    expect(clampOffset({ x: 30, y: 0 }, LANDSCAPE, VIEWPORT, 1)).toEqual({ x: 30, y: 0 });
  });

  it("widens the pan range as the zoom grows", () => {
    expect(clampOffset({ x: 999, y: 999 }, SQUARE, VIEWPORT, 2)).toEqual({ x: 100, y: 100 });
  });
});

describe("cropRect", () => {
  it("takes the centred square of a landscape photo at zoom 1", () => {
    expect(cropRect(LANDSCAPE, VIEWPORT, 1, { x: 0, y: 0 })).toEqual({
      sx: 100,
      sy: 0,
      size: 200,
    });
  });

  it("moves the source square opposite to the pan", () => {
    // Dragging the image right (+x) reveals what sits to its left.
    expect(cropRect(LANDSCAPE, VIEWPORT, 1, { x: 100, y: 0 })).toEqual({ sx: 0, sy: 0, size: 200 });
    expect(cropRect(LANDSCAPE, VIEWPORT, 1, { x: -100, y: 0 })).toEqual({
      sx: 200,
      sy: 0,
      size: 200,
    });
  });

  it("shrinks the source square as the zoom grows", () => {
    // 400x400 covers at scale 0.5, so zoom 2 reads only the middle 200px.
    expect(cropRect(SQUARE, VIEWPORT, 1, { x: 0, y: 0 })).toEqual({ sx: 0, sy: 0, size: 400 });
    expect(cropRect(SQUARE, VIEWPORT, 2, { x: 0, y: 0 })).toEqual({ sx: 100, sy: 100, size: 200 });
  });

  it("never reads outside the image, even with an absurd offset", () => {
    const rect = cropRect(PORTRAIT, VIEWPORT, 1, { x: 9999, y: -9999 });
    expect(rect.sx).toBeGreaterThanOrEqual(0);
    expect(rect.sy).toBeGreaterThanOrEqual(0);
    expect(rect.sx + rect.size).toBeLessThanOrEqual(PORTRAIT.width);
    expect(rect.sy + rect.size).toBeLessThanOrEqual(PORTRAIT.height);
  });
});

describe("offsetForZoom", () => {
  it("keeps the framing anchored when zooming in", () => {
    // At zoom 2 the pan range doubles, so the same framing needs a doubled offset.
    expect(offsetForZoom({ x: 50, y: 50 }, SQUARE, VIEWPORT, 2, 4)).toEqual({ x: 100, y: 100 });
  });

  it("re-clamps when zooming out past the pan range", () => {
    expect(offsetForZoom({ x: 100, y: 100 }, SQUARE, VIEWPORT, 2, 1)).toEqual({ x: 0, y: 0 });
  });
});
