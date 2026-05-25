import type { IStoresProvider } from "../contracts/stores";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useStoresProvider(): IStoresProvider {
  return useDataProviderSlice("stores", "useStoresProvider");
}
