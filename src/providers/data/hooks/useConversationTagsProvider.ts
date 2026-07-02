import type { IConversationTagsProvider } from "../contracts/conversationTags";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useConversationTagsProvider(): IConversationTagsProvider {
  return useDataProviderSlice("conversationTags", "useConversationTagsProvider");
}
