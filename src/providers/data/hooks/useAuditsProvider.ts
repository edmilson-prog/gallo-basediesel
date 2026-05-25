import type { IAuditsProvider } from "../contracts/audits";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useAuditsProvider(): IAuditsProvider {
  return useDataProviderSlice("audits", "useAuditsProvider");
}
