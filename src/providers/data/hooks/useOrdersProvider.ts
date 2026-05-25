import type { IOrdersProvider } from "../contracts/orders";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useOrdersProvider(): IOrdersProvider {
  return useDataProviderSlice("orders", "useOrdersProvider");
}
