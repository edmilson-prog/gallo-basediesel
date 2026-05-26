import type { ISdrSessionsProvider } from "../contracts/sdrSessions";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useSdrSessionsProvider(): ISdrSessionsProvider {
  return useDataProviderSlice("sdrSessions", "useSdrSessionsProvider");
}
