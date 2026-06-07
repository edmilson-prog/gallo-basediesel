import type { IScheduledSendProvider } from "../contracts/scheduledSend";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useScheduledSendProvider(): IScheduledSendProvider {
  return useDataProviderSlice("scheduledSend", "useScheduledSendProvider");
}
