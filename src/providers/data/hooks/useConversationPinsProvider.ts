import type { IConversationPinsProvider } from "../contracts/conversationPins";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useConversationPinsProvider(): IConversationPinsProvider {
  return useDataProviderSlice("conversationPins", "useConversationPinsProvider");
}
