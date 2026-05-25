import type { ISellersProvider } from "../contracts/sellers";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useSellersProvider(): ISellersProvider {
  return useDataProviderSlice("sellers", "useSellersProvider");
}
