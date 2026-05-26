/**
 * Stable avatar helpers — hash an entity id to a hue (0..360) and pick initials
 * from a display name. Used by every list/profile surface that renders a
 * placeholder when there's no photo (inbox cards, conversation header, customer
 * profile header, etc.). Pure / deterministic.
 */

/** Hash a string into a stable hue in the `[0, 360)` range. */
export function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}

/**
 * Pick 1–2 uppercase initials from a name:
 * - empty → `"?"`
 * - one word → first two letters of that word
 * - multi-word → first letter of first word + first letter of last word
 */
export function initialsFrom(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Background / foreground HSL pair derived from a hue — used by `<Avatar>` fallbacks. */
export function avatarColors(hue: number): { bg: string; fg: string } {
  return {
    bg: `hsl(${hue} 70% 88%)`,
    fg: `hsl(${hue} 60% 28%)`,
  };
}
