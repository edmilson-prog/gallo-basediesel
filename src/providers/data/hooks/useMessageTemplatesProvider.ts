import type { IMessageTemplatesProvider } from "../contracts/messageTemplates";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useMessageTemplatesProvider(): IMessageTemplatesProvider {
  return useDataProviderSlice("messageTemplates", "useMessageTemplatesProvider");
}
