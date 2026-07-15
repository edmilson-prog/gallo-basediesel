import type { ID, ISdrPilotSettings } from "@/shared/types";

export interface ISdrPilotSettingsProvider {
  /** Returns the store's pilot settings, creating a disabled row if it does not exist. */
  get(storeId: ID): Promise<ISdrPilotSettings>;
  /** Patches the pilot kill-switch / backstop timeout. Audited. */
  update(
    storeId: ID,
    patch: { sdrEnabled?: boolean; backstopTimeoutMinutes?: number },
  ): Promise<ISdrPilotSettings>;
}
