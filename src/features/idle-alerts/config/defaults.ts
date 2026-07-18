import type { IIdleAlertsSettings } from "@/shared/types";

/**
 * Defaults for idle-conversation alerts. `enabled: false` by design — the
 * rollout turns each store on only after the owner reviews the backfilled
 * backlog (spec: Rollout). 2/8/24 business hours ≈ "2h / 1 working day /
 * 3 working days" on a typical ~8h schedule.
 */
export const DEFAULT_IDLE_ALERTS_SETTINGS: IIdleAlertsSettings = {
  enabled: false,
  level1Hours: 2,
  level2Hours: 8,
  level3Hours: 24,
  notifyManagerOnLevel3: true,
};
