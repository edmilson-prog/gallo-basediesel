import type { INpsSettings } from "@/shared/types";
import { DEFAULT_NPS_BANDS, NPS_TARGET } from "./npsBand";

/**
 * The reading half of `nps_settings` — the "Parâmetros" tab of the panel.
 *
 * Split out as a `Pick` rather than a second interface so it cannot drift from
 * the stored shape: adding a column means widening `INpsSettings` once, and
 * anything missing here is a compile error rather than a field that silently
 * stops being saved.
 *
 * Nothing in this slice can make a message leave. The sending rules — triggers,
 * cooldown, sampling and the two anti-blast backstops — stay in
 * `NpsSettingsPage`, and the two screens deliberately share no field.
 */
export type INpsParameters = Pick<
  INpsSettings,
  | "targetScore"
  | "bandExcellenceMin"
  | "bandQualityMin"
  | "bandImprovementMin"
  | "followupMaxScore"
  | "followupSlaHours"
  | "followupOwner"
  | "followupEscalationEnabled"
  | "followupEscalationHours"
  | "showCockpitCard"
  | "showCustomerBadge"
  | "showSellerRanking"
  | "anonymizeResponses"
>;

/**
 * Shown while a store has no row of its own.
 *
 * Mirrors the column defaults in `20260813150000_nps_parameters.sql`, and takes
 * the target and the cuts from the engine constants so the kit's numbers are
 * stated in exactly one place.
 */
export const NPS_PARAMETER_DEFAULTS: INpsParameters = {
  targetScore: NPS_TARGET,
  bandExcellenceMin: DEFAULT_NPS_BANDS.excellence,
  bandQualityMin: DEFAULT_NPS_BANDS.quality,
  bandImprovementMin: DEFAULT_NPS_BANDS.improvement,
  followupMaxScore: 6,
  followupSlaHours: 24,
  followupOwner: "attendant",
  followupEscalationEnabled: true,
  followupEscalationHours: 48,
  showCockpitCard: true,
  showCustomerBadge: true,
  showSellerRanking: true,
  anonymizeResponses: false,
};

/**
 * The two cut-offs the tratativa may use.
 *
 * 6 chases only detractors; 8 also chases passives — a much larger queue, which
 * is why the choice is a setting and not a constant.
 */
export const NPS_FOLLOWUP_CUTOFFS = [6, 8] as const;

/** Pulls just the parameter slice out of a full settings row. */
export function toNpsParameters(settings: INpsSettings): INpsParameters {
  return {
    targetScore: settings.targetScore,
    bandExcellenceMin: settings.bandExcellenceMin,
    bandQualityMin: settings.bandQualityMin,
    bandImprovementMin: settings.bandImprovementMin,
    followupMaxScore: settings.followupMaxScore,
    followupSlaHours: settings.followupSlaHours,
    followupOwner: settings.followupOwner,
    followupEscalationEnabled: settings.followupEscalationEnabled,
    followupEscalationHours: settings.followupEscalationHours,
    showCockpitCard: settings.showCockpitCard,
    showCustomerBadge: settings.showCustomerBadge,
    showSellerRanking: settings.showSellerRanking,
    anonymizeResponses: settings.anonymizeResponses,
  };
}
