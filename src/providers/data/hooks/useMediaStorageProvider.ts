import type { IMediaStorageProvider } from "../contracts/mediaStorage";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useMediaStorageProvider(): IMediaStorageProvider {
  return useDataProviderSlice("media", "useMediaStorageProvider");
}
