import type { IWhatsAppAccountsProvider } from "../contracts/whatsappAccounts";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useWhatsAppAccountsProvider(): IWhatsAppAccountsProvider {
  return useDataProviderSlice("whatsappAccounts", "useWhatsAppAccountsProvider");
}
