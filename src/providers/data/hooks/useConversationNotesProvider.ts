import type { IConversationNotesProvider } from "../contracts/conversationNotes";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useConversationNotesProvider(): IConversationNotesProvider {
  return useDataProviderSlice("conversationNotes", "useConversationNotesProvider");
}
