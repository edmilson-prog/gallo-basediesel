import type { IContactsProvider } from "../contracts/contacts";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useContactsProvider(): IContactsProvider {
  return useDataProviderSlice("contacts", "useContactsProvider");
}
