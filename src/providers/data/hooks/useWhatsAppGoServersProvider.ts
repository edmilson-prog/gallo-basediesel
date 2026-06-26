import type { IWhatsAppGoServersProvider } from "../contracts/whatsappGoServers";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useWhatsAppGoServersProvider(): IWhatsAppGoServersProvider {
  return useDataProviderSlice("whatsappGoServers", "useWhatsAppGoServersProvider");
}
