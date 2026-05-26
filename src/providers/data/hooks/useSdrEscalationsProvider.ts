import type { ISdrEscalationsProvider } from "../contracts/sdrEscalations";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useSdrEscalationsProvider(): ISdrEscalationsProvider {
  return useDataProviderSlice("sdrEscalations", "useSdrEscalationsProvider");
}
