/**
 * Named NPS bands and the internal target, from the design kit
 * (`ui_kits/nps` — `npsFaixa`, `NPS_META`).
 *
 * A bare score says little to someone who does not work with NPS daily: 48 and
 * 52 look alike and sit on opposite sides of a threshold the company cares
 * about. Naming the band is what turns the number into a judgement.
 */

export type INpsBand = "critical" | "improvement" | "quality" | "excellence";

/** Internal goal. The trend chart draws its dashed line here. */
export const NPS_TARGET = 60;

export function npsBand(score: number): INpsBand {
  if (score >= 75) return "excellence";
  if (score >= 50) return "quality";
  if (score >= 0) return "improvement";
  return "critical";
}

const BAND_LABEL: Record<INpsBand, string> = {
  critical: "Crítica",
  improvement: "Aperfeiçoamento",
  quality: "Qualidade",
  excellence: "Excelência",
};

export function npsBandLabel(score: number): string {
  return BAND_LABEL[npsBand(score)];
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
