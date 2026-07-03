import type { IActivityProvider } from "../contracts/activity";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useActivityProvider(): IActivityProvider {
  return useDataProviderSlice("activity", "useActivityProvider");
}
