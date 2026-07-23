import type { FunnelAccent } from "@/shared/types";

/**
 * Temporary bridge from the legacy free-form `IPipelineStage.color` hex to a
 * funnel accent slot, so components can stop injecting `style={{ color }}`
 * before the stage table (phase 2) gives every stage a real `accent`.
 *
 * Deleted once `lead_funnel_stages.accent` is the only source.
 */

/** Reference hue per slot, in degrees. Slot 0 is achromatic by definition. */
const SLOT_HUES: ReadonlyArray<{ slot: FunnelAccent; hue: number }> = [
  { slot: 1, hue: 0 }, // red
  { slot: 7, hue: 25 }, // orange
  { slot: 2, hue: 40 }, // amber
  { slot: 3, hue: 140 }, // green
  { slot: 6, hue: 175 }, // teal
  { slot: 4, hue: 215 }, // steel blue
  { slot: 5, hue: 265 }, // violet
  { slot: 8, hue: 300 }, // magenta
];

const HEX_RE = /^#?([0-9a-f]{6})$/i;

export function hexToAccentSlot(hex: string | undefined): FunnelAccent {
  if (!hex) return 0;
  const match = HEX_RE.exec(hex.trim());
  const hexDigits = match?.[1];
  if (!hexDigits) return 0;

  const int = Number.parseInt(hexDigits, 16);
  const r = ((int >> 16) & 0xff) / 255;
  const g = ((int >> 8) & 0xff) / 255;
  const b = (int & 0xff) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  // Near-achromatic colours (the seeded #5b6b7a steel included) land on neutral
  // only when they are genuinely grey; a desaturated blue still reads as blue.
  if (delta < 0.06) return 0;

  let hue: number;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);
  if (hue < 0) hue += 360;

  let best: { slot: FunnelAccent; hue: number } = SLOT_HUES[0] ?? { slot: 0, hue: 0 };
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of SLOT_HUES) {
    const raw = Math.abs(hue - candidate.hue);
    const distance = Math.min(raw, 360 - raw);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best.slot;
}
