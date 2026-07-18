import type { ID, ISdrPilotSettings } from "@/shared/types";
import { selectAllSdrPilotSettings } from "../store/selectors";
import { useMockStore } from "../store/mockStore";
import { runApi } from "./utils";

/**
 * Mock API for the SDR production pilot's per-store settings. Lazily creates
 * a disabled row on first read — mirrors the real table (`sdr_settings`),
 * which only gains a row once someone saves from the UI, always starting
 * `sdr_enabled=false`.
 */
function ensureSettings(storeId: ID): ISdrPilotSettings {
  const existing = selectAllSdrPilotSettings().find((s) => s.storeId === storeId);
  if (existing) return existing;
  const created: ISdrPilotSettings = {
    storeId,
    sdrEnabled: false,
    backstopTimeoutMinutes: 2,
    escalationTimeoutUrgentMinutes: 5,
    escalationTimeoutNormalMinutes: 30,
    updatedAt: new Date().toISOString(),
    updatedBy: null,
  };
  useMockStore.setState((state) => ({ sdrPilotSettings: [...state.sdrPilotSettings, created] }));
  return created;
}

export const sdrPilotSettingsApi = {
  get(storeId: ID): Promise<ISdrPilotSettings> {
    return runApi("sdrPilotSettingsApi", "get", () => ensureSettings(storeId), { payload: { storeId } });
  },

  update(
    storeId: ID,
    patch: {
      sdrEnabled?: boolean;
      backstopTimeoutMinutes?: number;
      escalationTimeoutUrgentMinutes?: number;
      escalationTimeoutNormalMinutes?: number;
    },
  ): Promise<ISdrPilotSettings> {
    return runApi(
      "sdrPilotSettingsApi",
      "update",
      () => {
        const current = ensureSettings(storeId);
        const updated: ISdrPilotSettings = {
          ...current,
          ...(patch.sdrEnabled !== undefined ? { sdrEnabled: patch.sdrEnabled } : {}),
          ...(patch.backstopTimeoutMinutes !== undefined
            ? { backstopTimeoutMinutes: patch.backstopTimeoutMinutes }
            : {}),
          ...(patch.escalationTimeoutUrgentMinutes !== undefined
            ? { escalationTimeoutUrgentMinutes: patch.escalationTimeoutUrgentMinutes }
            : {}),
          ...(patch.escalationTimeoutNormalMinutes !== undefined
            ? { escalationTimeoutNormalMinutes: patch.escalationTimeoutNormalMinutes }
            : {}),
          updatedAt: new Date().toISOString(),
        };
        useMockStore.setState((state) => ({
          sdrPilotSettings: state.sdrPilotSettings.map((s) =>
            s.storeId === updated.storeId ? updated : s,
          ),
        }));
        return updated;
      },
      { payload: { storeId, patch } },
    );
  },
};
