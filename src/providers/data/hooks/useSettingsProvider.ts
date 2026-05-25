import type { ISettingsProvider } from "../contracts/settings";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useSettingsProvider(): ISettingsProvider {
  return useDataProviderSlice("settings", "useSettingsProvider");
}
