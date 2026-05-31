import type { ICopilotProvider } from "../contracts/copilot";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useCopilotProvider(): ICopilotProvider {
  return useDataProviderSlice("copilot", "useCopilotProvider");
}
