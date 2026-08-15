/**
 * Named NPS bands and the internal target, from the design kit
 * (`ui_kits/nps` — `npsFaixa`, `NPS_META`).
 *
 * A bare score says little to someone who does not work with NPS daily: 48 and
 * 52 look alike and sit on opposite sides of a threshold the company cares
 * about. Naming the band is what turns the number into a judgement.
 *
 * The target and the three cuts became store-configurable with the kit's
 * "Parâmetros" tab (`nps_settings`). They arrive here as an *optional* argument
 * defaulting to the kit's values, so a surface that has no settings in hand
 * still reads exactly as before and no call site is forced to thread
 * configuration it does not have.
 */

export type INpsBand = "critical" | "improvement" | "quality" | "excellence";

/**
 * Lower bound of each named band, in points.
 *
 * `critical` has no entry on purpose: it is whatever falls below `improvement`,
 * so the bands can never leave a score unclassified.
 */
export interface INpsBandThresholds {
  excellence: number;
  quality: number;
  improvement: number;
}

/** Internal goal. The trend chart draws its dashed line here. */
export const NPS_TARGET = 60;

/** The kit's cuts — what every surface reads until a store moves them. */
export const DEFAULT_NPS_BANDS: INpsBandThresholds = {
  excellence: 75,
  quality: 50,
  improvement: 0,
};

export function npsBand(score: number, bands: INpsBandThresholds = DEFAULT_NPS_BANDS): INpsBand {
  if (score >= bands.excellence) return "excellence";
  if (score >= bands.quality) return "quality";
  if (score >= bands.improvement) return "improvement";
  return "critical";
}

const BAND_LABEL: Record<INpsBand, string> = {
  critical: "Crítica",
  improvement: "Aperfeiçoamento",
  quality: "Qualidade",
  excellence: "Excelência",
};

export function npsBandLabel(score: number, bands: INpsBandThresholds = DEFAULT_NPS_BANDS): string {
  return BAND_LABEL[npsBand(score, bands)];
}

/**
 * Whether the three cuts still decrease strictly.
 *
 * Two equal cuts would make a band unreachable, and an inverted pair would make
 * the upper test win for scores that belong to the lower band — either way the
 * ruler stops describing reality. The Parâmetros tab refuses to save an
 * unordered set rather than storing one and letting every reader disagree.
 */
export function npsBandsAreOrdered(bands: INpsBandThresholds): boolean {
  return bands.excellence > bands.quality && bands.quality > bands.improvement;
}

/** Closed interval a band occupies on the −100..100 ruler. */
export interface INpsBandRange {
  band: INpsBand;
  min: number;
  max: number;
}

/**
 * The four bands as intervals, best first.
 *
 * Derived from the same thresholds `npsBand` reads, so the ranges the settings
 * card prints can never drift from the classification it is configuring.
 */
export function npsBandRanges(bands: INpsBandThresholds = DEFAULT_NPS_BANDS): INpsBandRange[] {
  return [
    { band: "excellence", min: bands.excellence, max: 100 },
    { band: "quality", min: bands.quality, max: bands.excellence - 1 },
    { band: "improvement", min: bands.improvement, max: bands.quality - 1 },
    { band: "critical", min: -100, max: bands.improvement - 1 },
  ];
}

/**
 * Where the marker sits on the −100..100 ruler, as a percentage of its width.
 * Clamped, so a score outside the theoretical range never pushes the marker
 * off the track.
 */
export function rulerPosition(score: number): number {
  const clamped = Math.max(-100, Math.min(100, score));
  return (clamped + 100) / 2;
}
