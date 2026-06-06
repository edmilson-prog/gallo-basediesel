import type { IQuickReplyProvider } from "../contracts/quickReply";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useQuickReplyProvider(): IQuickReplyProvider {
  return useDataProviderSlice("quickReply", "useQuickReplyProvider");
}
