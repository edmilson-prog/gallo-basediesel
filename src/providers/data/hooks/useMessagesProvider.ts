import type { IMessagesProvider } from "../contracts/messages";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useMessagesProvider(): IMessagesProvider {
  return useDataProviderSlice("messages", "useMessagesProvider");
}
