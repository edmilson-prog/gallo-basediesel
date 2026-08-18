import type { IFiscalNotesProvider } from "../contracts/fiscalNotes";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useFiscalNotesProvider(): IFiscalNotesProvider {
  return useDataProviderSlice("fiscalNotes", "useFiscalNotesProvider");
}
