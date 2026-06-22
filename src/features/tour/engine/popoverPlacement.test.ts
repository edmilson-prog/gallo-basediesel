import { describe, expect, it } from "vitest";
import { computePlacement } from "./popoverPlacement";

const viewport = { width: 1000, height: 800 };
const card = { width: 300, height: 160 };

describe("computePlacement", () => {
  it("places below the target by default when there is room", () => {
    const target = { top: 100, left: 400, width: 200, height: 40 };
    const p = computePlacement(target, card, viewport);
    expect(p.side).toBe("bottom");
    expect(p.top).toBeGreaterThan(target.top + target.height);
  });

  it("flips above when there is no room below", () => {
    const target = { top: 700, left: 400, width: 200, height: 40 };
    const p = computePlacement(target, card, viewport, "bottom");
    expect(p.side).toBe("top");
    expect(p.top).toBeLessThan(target.top);
  });

  it("clamps horizontally so the card stays on screen", () => {
    const target = { top: 100, left: 960, width: 30, height: 30 };
    const p = computePlacement(target, card, viewport);
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + card.width).toBeLessThanOrEqual(viewport.width - 8);
  });

  it("honors a 'right' preference when it fits", () => {
    const target = { top: 300, left: 100, width: 40, height: 40 };
    const p = computePlacement(target, card, viewport, "right");
    expect(p.side).toBe("right");
    expect(p.left).toBeGreaterThanOrEqual(target.left + target.width);
  });
});
