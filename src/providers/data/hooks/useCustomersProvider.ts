import type { ICustomersProvider } from "../contracts/customers";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useCustomersProvider(): ICustomersProvider {
  return useDataProviderSlice("customers", "useCustomersProvider");
}
