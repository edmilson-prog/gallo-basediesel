/**
 * Geometry for the profile-photo framing step.
 *
 * Pure — no DOM, no canvas. The dialog owns the pixels; this module owns the
 * math that keeps the square viewport always covered by the image and turns the
 * on-screen pan/zoom into a source rectangle for `drawImage`.
 *
 * Coordinate model: the image is drawn centred in a square viewport of
 * `viewport` CSS pixels, displaced by `offset` (also in CSS pixels). Zoom 1
 * means "exactly covers the viewport", so the frame can never show empty space.
 */

/** Side of the exported square image, in pixels. */
export const AVATAR_OUTPUT_SIZE = 512;

/** JPEG quality used when encoding the cropped photo. */
export const AVATAR_OUTPUT_QUALITY = 0.92;

export const AVATAR_MIN_ZOOM = 1;
export const AVATAR_MAX_ZOOM = 4;
export const AVATAR_ZOOM_STEP = 0.02;

export interface IAvatarSize {
  width: number;
  height: number;
}

export interface IAvatarOffset {
  x: number;
  y: number;
}

export interface IAvatarCropRect {
  /** Left edge of the source square, in natural image pixels. */
  sx: number;
  /** Top edge of the source square, in natural image pixels. */
  sy: number;
  /** Side of the source square, in natural image pixels. */
  size: number;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  // The `+ 0` normalises -0 to 0: clamping a negative value against a zero-width
  // range yields -0, which is harmless in CSS but leaks into equality checks.
  return Math.min(max, Math.max(min, value)) + 0;
}

export function clampZoom(zoom: number): number {
  return clamp(zoom, AVATAR_MIN_ZOOM, AVATAR_MAX_ZOOM);
}

/**
 * Scale at which the image exactly covers the viewport — the shorter side
 * touches both edges. Degenerate inputs fall back to 1 so the caller never
 * divides by zero.
 */
export function coverScale(natural: IAvatarSize, viewport: number): number {
  if (natural.width <= 0 || natural.height <= 0 || viewport <= 0) return 1;
  return Math.max(viewport / natural.width, viewport / natural.height);
}

/** Effective scale applied to the image at a given zoom. */
export function scaleAt(natural: IAvatarSize, viewport: number, zoom: number): number {
  return coverScale(natural, viewport) * clampZoom(zoom);
}

/** On-screen size of the image at a given zoom, in CSS pixels. */
export function renderedSize(natural: IAvatarSize, viewport: number, zoom: number): IAvatarSize {
  const scale = scaleAt(natural, viewport, zoom);
  return { width: natural.width * scale, height: natural.height * scale };
}

/**
 * Keeps the pan inside the image: the viewport must stay fully covered, so the
 * offset is bounded by half the overflow on each axis.
 */
export function clampOffset(
  offset: IAvatarOffset,
  natural: IAvatarSize,
  viewport: number,
  zoom: number,
): IAvatarOffset {
  const { width, height } = renderedSize(natural, viewport, zoom);
  const maxX = Math.max(0, (width - viewport) / 2);
  const maxY = Math.max(0, (height - viewport) / 2);
  return { x: clamp(offset.x, -maxX, maxX), y: clamp(offset.y, -maxY, maxY) };
}

/**
 * Source square to copy out of the natural image, given the current framing.
 * Feeds `ctx.drawImage(img, sx, sy, size, size, 0, 0, out, out)`.
 */
export function cropRect(
  natural: IAvatarSize,
  viewport: number,
  zoom: number,
  offset: IAvatarOffset,
): IAvatarCropRect {
  const scale = scaleAt(natural, viewport, zoom);
  const safe = clampOffset(offset, natural, viewport, zoom);
  const size = viewport / scale;
  return {
    sx: (natural.width - size) / 2 - safe.x / scale,
    sy: (natural.height - size) / 2 - safe.y / scale,
    size,
  };
}

/**
 * Re-centres the pan when the zoom changes, keeping the point under the middle
 * of the viewport fixed — otherwise zooming out would drift the framing.
 */
export function offsetForZoom(
  offset: IAvatarOffset,
  natural: IAvatarSize,
  viewport: number,
  fromZoom: number,
  toZoom: number,
): IAvatarOffset {
  const from = clampZoom(fromZoom);
  const to = clampZoom(toZoom);
  const ratio = from === 0 ? 1 : to / from;
  return clampOffset({ x: offset.x * ratio, y: offset.y * ratio }, natural, viewport, to);
}
