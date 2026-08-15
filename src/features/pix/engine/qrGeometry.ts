//
// Pure geometry, kept apart from the canvas so the integer-scale rule is
// testable without a DOM.

/** Quiet zone required by the spec, in modules, on each side. */
export const QUIET_MODULES = 4;

/** 4:3 so ImageBubble's object-cover crops nothing. See the spec, §5.4. */
export const PIX_QR_EXPORT = { width: 800, height: 600 } as const;

/**
 * Target drawing box on the export: 512px inside a 600px-tall canvas, so the
 * symbol keeps a white band of ~44px top and bottom. Without it the symbol
 * would grow to fill the short edge and sit too close to the image border,
 * which some readers treat as a missing quiet zone.
 */
export const PIX_QR_BOX_RATIO = 512 / 600;

export interface IQrGeometry {
  scale: number;
  side: number;
  originX: number;
  originY: number;
}

export function computeQrGeometry(
  moduleCount: number,
  width: number,
  height: number,
  /** 1 fills the shorter edge (preview); PIX_QR_BOX_RATIO insets it (export). */
  boxRatio = 1,
): IQrGeometry {
  const total = moduleCount + QUIET_MODULES * 2;
  const box = Math.min(width, height) * boxRatio;
  // Integer scale, always — this is the rule that keeps the QR scannable.
  const scale = Math.max(2, Math.floor(box / total));
  const side = total * scale;
  return {
    scale,
    side,
    originX: Math.round((width - side) / 2),
    originY: Math.round((height - side) / 2),
  };
}
