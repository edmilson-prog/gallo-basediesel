import type { ITransfersProvider } from "../contracts/transfers";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useTransfersProvider(): ITransfersProvider {
  return useDataProviderSlice("transfers", "useTransfersProvider");
}
