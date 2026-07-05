import type { IConversationParticipantsProvider } from "../contracts/conversationParticipants";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useConversationParticipantsProvider(): IConversationParticipantsProvider {
  return useDataProviderSlice("conversationParticipants", "useConversationParticipantsProvider");
}
