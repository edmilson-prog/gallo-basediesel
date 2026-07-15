import { sdrPilotSettingsApi } from "@/mocks";
import { auditLog } from "@/features/rbac";
import type { ID } from "@/shared/types";
import type { ISdrPilotSettingsProvider } from "../../contracts/sdrPilotSettings";

/**
 * Mock implementation of {@link ISdrPilotSettingsProvider} — thin adapter over
 * `sdrPilotSettingsApi`, adding the audit trail on kill-switch/timeout changes.
 */
export const mockSdrPilotSettingsProvider: ISdrPilotSettingsProvider = {
  get: (storeId) => sdrPilotSettingsApi.get(storeId),
  async update(
    storeId: ID,
    patch: { sdrEnabled?: boolean; backstopTimeoutMinutes?: number },
  ) {
    const updated = await sdrPilotSettingsApi.update(storeId, patch);
    auditLog({
      action: "sdr_pilot.settings.update",
      resource: "sdr_settings",
      resourceId: updated.storeId,
      storeId: updated.storeId,
      after: { sdrEnabled: updated.sdrEnabled, backstopTimeoutMinutes: updated.backstopTimeoutMinutes },
    });
    return updated;
  },
};
