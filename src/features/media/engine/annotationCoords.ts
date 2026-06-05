/** A point in pixel space relative to the rendered media box. */
export interface IPixelPoint {
  x: number;
  y: number;
}

/** A point in normalized [0..1] space (survives resize / zoom / DPR). */
export interface INormalizedPoint {
  x: number;
  y: number;
}

/** Pixel dimensions of the rendered media box. */
export interface IBox {
  width: number;
  height: number;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Pixel → normalized [0..1], clamped. Zero-sized box ⇒ {0,0} (no NaN). */
export function normalizePoint(point: IPixelPoint, box: IBox): INormalizedPoint {
  return {
    x: box.width > 0 ? clamp01(point.x / box.width) : 0,
    y: box.height > 0 ? clamp01(point.y / box.height) : 0,
  };
}

/** Normalized [0..1] → pixel, against the current box. */
export function denormalizePoint(point: INormalizedPoint, box: IBox): IPixelPoint {
  return {
    x: clamp01(point.x) * box.width,
    y: clamp01(point.y) * box.height,
  };
}
