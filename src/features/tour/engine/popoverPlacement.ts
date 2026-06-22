import type { TourSide } from "../types";

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Placement {
  side: TourSide;
  top: number;
  left: number;
}

const MARGIN = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function fits(side: TourSide, t: Rect, c: Size, vp: Size, gap: number): boolean {
  switch (side) {
    case "bottom":
      return t.top + t.height + gap + c.height <= vp.height - MARGIN;
    case "top":
      return t.top - gap - c.height >= MARGIN;
    case "right":
      return t.left + t.width + gap + c.width <= vp.width - MARGIN;
    case "left":
      return t.left - gap - c.width >= MARGIN;
  }
}

const OPPOSITE: Record<TourSide, TourSide> = {
  bottom: "top",
  top: "bottom",
  right: "left",
  left: "right",
};

export function computePlacement(
  target: Rect,
  card: Size,
  viewport: Size,
  preferred: TourSide = "bottom",
  gap = 12,
): Placement {
  let side = preferred;
  if (!fits(side, target, card, viewport, gap) && fits(OPPOSITE[side], target, card, viewport, gap)) {
    side = OPPOSITE[side];
  }

  let top: number;
  let left: number;
  if (side === "bottom" || side === "top") {
    top = side === "bottom" ? target.top + target.height + gap : target.top - gap - card.height;
    left = target.left + target.width / 2 - card.width / 2;
  } else {
    left = side === "right" ? target.left + target.width + gap : target.left - gap - card.width;
    top = target.top + target.height / 2 - card.height / 2;
  }

  top = clamp(top, MARGIN, viewport.height - card.height - MARGIN);
  left = clamp(left, MARGIN, viewport.width - card.width - MARGIN);
  return { side, top, left };
}
