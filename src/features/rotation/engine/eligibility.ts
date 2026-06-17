import type { ISeller, RotationSkipReason } from "@/shared/types";
import { isWithinWorkSchedule } from "@/features/access";

export interface IEligibilityResult {
  eligible: boolean;
  reason: RotationSkipReason | "selected";
}

/**
 * Whether a seller can receive a conversation from the rotation NOW. Order of
 * checks (cheapest/most decisive first): participation toggle → active → online
 * → within work schedule (PRD-212). A seller with no schedule is unrestricted.
 */
export function isSellerEligible(
  seller: ISeller,
  participant: { enabled: boolean },
  now: Date,
): IEligibilityResult {
  if (!participant.enabled) return { eligible: false, reason: "skipped_disabled" };
  if (!seller.active) return { eligible: false, reason: "skipped_inactive" };
  if (seller.availability !== "online") return { eligible: false, reason: "skipped_offline" };
  if (
    !isWithinWorkSchedule(
      { workSchedule: seller.workSchedule, scheduleOverrides: seller.scheduleOverrides },
      now,
    )
  ) {
    return { eligible: false, reason: "skipped_off_hours" };
  }
  return { eligible: true, reason: "selected" };
}
