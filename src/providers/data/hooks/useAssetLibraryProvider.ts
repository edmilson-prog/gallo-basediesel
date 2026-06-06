import type { IAssetLibraryProvider } from "../contracts/assetLibrary";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useAssetLibraryProvider(): IAssetLibraryProvider {
  return useDataProviderSlice("assetLibrary", "useAssetLibraryProvider");
}
