import type { IPartsProvider } from "../contracts/parts";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function usePartsProvider(): IPartsProvider {
  return useDataProviderSlice("parts", "usePartsProvider");
}
