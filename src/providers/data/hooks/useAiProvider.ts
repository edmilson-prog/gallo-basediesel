import type { IAiProvider } from "../contracts/ai";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useAiProvider(): IAiProvider {
  return useDataProviderSlice("ai", "useAiProvider");
}
