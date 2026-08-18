import type { INpsSettings } from "@/shared/types";
import { DEFAULT_NPS_BANDS, NPS_TARGET, type INpsBandThresholds } from "./npsBand";

/**
 * The reading parameters of the kit's "Parâmetros" tab, isolated from the
 * sending rules they share a row with.
 *
 * The split is not cosmetic. Sending rules decide which customers get a
 * message; reading parameters only decide how the same answers are labelled.
 * Keeping them apart in code is what lets the panel re-read history when a cut
 * moves without anyone fearing it also re-sent something.
 */

export type INpsReadingParams = Pick<
  INpsSettings,
  | "targetScore"
  | "bandExcellence"
  | "bandQuality"
  | "bandImprovement"
  | "recoveryThreshold"
  | "recoverySlaHours"
  | "recoveryOwner"
  | "recoveryEscalate"
  | "showWidget"
  | "showOnFiche"
  | "includeInRanking"
  | "anonymousForTeam"
>;

/**
 * Mirrors the column defaults of
 * `20260813160000_nps_recovery_and_parameters.sql`.
 *
 * A store with no row has to read identically to a configured one, otherwise
 * the panel changes meaning depending on who opens it.
 */
export const NPS_READING_DEFAULTS: INpsReadingParams = {
  targetScore: NPS_TARGET,
  bandExcellence: DEFAULT_NPS_BANDS.excellence,
  bandQuality: DEFAULT_NPS_BANDS.quality,
  bandImprovement: DEFAULT_NPS_BANDS.improvement,
  recoveryThreshold: 6,
  recoverySlaHours: 24,
  recoveryOwner: "attendant",
  recoveryEscalate: true,
  showWidget: true,
  showOnFiche: true,
  // Default off: PRD-148B refused to expose NPS per attendant as
  // compare-and-shame, and folding it into the ranking changes what the team
  // optimises for. The kit offers the switch; the default stays the PRD's.
  includeInRanking: false,
  anonymousForTeam: false,
};

/** The band cuts of a settings row, in the shape `npsBand` expects. */
export function bandsOf(settings: INpsReadingParams | null | undefined): INpsBandThresholds {
  if (!settings) return DEFAULT_NPS_BANDS;
  return {
    excellence: settings.bandExcellence,
    quality: settings.bandQuality,
    improvement: settings.bandImprovement,
  };
}

/** The target of a settings row, falling back to the kit's 60. */
export function targetOf(settings: INpsReadingParams | null | undefined): number {
  return settings?.targetScore ?? NPS_TARGET;
}
