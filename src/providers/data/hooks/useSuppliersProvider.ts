import type { ISuppliersProvider } from "../contracts/suppliers";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useSuppliersProvider(): ISuppliersProvider {
  return useDataProviderSlice("suppliers", "useSuppliersProvider");
}
