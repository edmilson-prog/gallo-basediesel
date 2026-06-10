import type { IStorefrontProvider } from "../contracts/storefront";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useStorefrontProvider(): IStorefrontProvider {
  return useDataProviderSlice("storefront", "useStorefrontProvider");
}
