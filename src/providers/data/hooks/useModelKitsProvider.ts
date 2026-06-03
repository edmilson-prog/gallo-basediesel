import type { IModelKitsProvider } from "../contracts/modelKits";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useModelKitsProvider(): IModelKitsProvider {
  return useDataProviderSlice("modelKits", "useModelKitsProvider");
}
