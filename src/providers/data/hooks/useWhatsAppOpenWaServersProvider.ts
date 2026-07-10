import type { IWhatsAppOpenWaServersProvider } from "../contracts/whatsappOpenWaServers";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useWhatsAppOpenWaServersProvider(): IWhatsAppOpenWaServersProvider {
  return useDataProviderSlice("whatsappOpenWaServers", "useWhatsAppOpenWaServersProvider");
}
