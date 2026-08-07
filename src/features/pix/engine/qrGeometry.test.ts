import { describe, it, expect } from "vitest";
import {
  computeQrGeometry,
  PIX_QR_BOX_RATIO,
  PIX_QR_EXPORT,
  QUIET_MODULES,
} from "./qrGeometry";

/** The export geometry, as the renderer computes it. */
const exportGeometry = (count: number) =>
  computeQrGeometry(count, PIX_QR_EXPORT.width, PIX_QR_EXPORT.height, PIX_QR_BOX_RATIO);

describe("computeQrGeometry", () => {
  it("always produces an integer module scale", () => {
    // Fractional scale anti-aliases the module edges and is the number one
    // cause of a QR that "sometimes scans".
    for (let count = 21; count <= 77; count += 4) {
      const g = exportGeometry(count);
      expect(Number.isInteger(g.scale)).toBe(true);
      expect(g.scale).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps the whole symbol plus its quiet zone inside the canvas", () => {
    const g = exportGeometry(49);
    expect(g.side).toBe((49 + QUIET_MODULES * 2) * g.scale);
    expect(g.side).toBeLessThanOrEqual(PIX_QR_EXPORT.height);
    expect(g.originX).toBeGreaterThanOrEqual(0);
    expect(g.originY).toBeGreaterThanOrEqual(0);
  });

  it("centres the symbol on integer pixel boundaries", () => {
    const g = exportGeometry(45);
    expect(Number.isInteger(g.originX)).toBe(true);
    expect(Number.isInteger(g.originY)).toBe(true);
    expect(g.originX).toBe(Math.round((PIX_QR_EXPORT.width - g.side) / 2));
  });

  it("leaves a white band above and below in the 4:3 export", () => {
    // The 512px target box inside a 600px-tall canvas is what guarantees this.
    // Without the box ratio the symbol would grow to 570px and leave 15px a side.
    const g = exportGeometry(49);
    expect((PIX_QR_EXPORT.height - g.side) / 2).toBeGreaterThanOrEqual(44);
  });

  it("fills a square preview canvas — no box ratio there", () => {
    const g = computeQrGeometry(49, 448, 448);
    expect(Number.isInteger(g.scale)).toBe(true);
    expect(g.side).toBeLessThanOrEqual(448);
    // The preview must stay sharp: at DPR 2 this is 7px per module.
    expect(g.scale).toBeGreaterThanOrEqual(7);
  });
});
