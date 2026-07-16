import type { ISdrPilotSettingsProvider } from "../contracts/sdrPilotSettings";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useSdrPilotSettingsProvider(): ISdrPilotSettingsProvider {
  return useDataProviderSlice("sdrPilotSettings", "useSdrPilotSettingsProvider");
}
