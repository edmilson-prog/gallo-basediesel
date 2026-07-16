import type { IWahaServersProvider } from "../contracts/wahaServers";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useWahaServersProvider(): IWahaServersProvider {
  return useDataProviderSlice("wahaServers", "useWahaServersProvider");
}
