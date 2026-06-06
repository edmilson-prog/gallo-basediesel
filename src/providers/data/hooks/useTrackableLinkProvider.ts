import type { ITrackableLinkProvider } from "../contracts/trackableLink";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useTrackableLinkProvider(): ITrackableLinkProvider {
  return useDataProviderSlice("trackableLink", "useTrackableLinkProvider");
}
