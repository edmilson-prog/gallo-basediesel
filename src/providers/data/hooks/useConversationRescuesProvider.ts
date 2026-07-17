import type { IConversationRescuesProvider } from "../contracts/conversationRescues";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useConversationRescuesProvider(): IConversationRescuesProvider {
  return useDataProviderSlice("conversationRescues", "useConversationRescuesProvider");
}
