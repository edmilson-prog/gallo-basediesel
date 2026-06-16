import { useCallback } from "react";
import type { IUserProfile } from "@/features/auth/mock-users";
import { useSellersProvider } from "@/providers/data";
import { evaluateAccess, OPERATIONAL_ROLES, type IAccessDecision } from "../engine/accessGate";

export function useAccessGate() {
  const sellers = useSellersProvider();

  const evaluateForProfile = useCallback(
    async (profile: IUserProfile): Promise<IAccessDecision> => {
      // Non-operational roles (Owner/Gestor/Cliente) are exempt — skip the fetch.
      if (!OPERATIONAL_ROLES.includes(profile.role) || !profile.sellerId) {
        return { allowed: true, reason: "ok", nextOpenAt: null };
      }
      try {
        const seller = await sellers.get(profile.sellerId);
        return evaluateAccess({
          role: profile.role,
          active: seller.active,
          workSchedule: seller.workSchedule,
          scheduleOverrides: seller.scheduleOverrides,
          accessGrant: seller.accessGrant,
          now: new Date(),
        });
      } catch {
        // Fail open: never lock someone out because the schedule read failed.
        return { allowed: true, reason: "ok", nextOpenAt: null };
      }
    },
    [sellers],
  );

  return { evaluateForProfile };
}
