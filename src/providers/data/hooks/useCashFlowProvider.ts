import type { ICashFlowProvider } from "../contracts/cashflow";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useCashFlowProvider(): ICashFlowProvider {
  return useDataProviderSlice("cashflow", "useCashFlowProvider");
}
