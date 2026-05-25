import type { IConversationsProvider } from "../contracts/conversations";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useConversationsProvider(): IConversationsProvider {
  return useDataProviderSlice("conversations", "useConversationsProvider");
}
