import type { IQuotesProvider } from "../contracts/quotes";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useQuotesProvider(): IQuotesProvider {
  return useDataProviderSlice("quotes", "useQuotesProvider");
}
