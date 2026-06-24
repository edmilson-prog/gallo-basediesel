import type { IAtendimentoMetricsProvider } from "../contracts/atendimentoMetrics";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useAtendimentoMetricsProvider(): IAtendimentoMetricsProvider {
  return useDataProviderSlice("atendimentoMetrics", "useAtendimentoMetricsProvider");
}
