import type {
  ServiceMetricParams,
  MetricAudience,
  INovosAtendimentosResult,
  IMessageVolumeResult,
  IMessagesByUserResult,
  IStatusDistributionResult,
  IAccumulatedChatsResult,
  IHandleTimeStatsResult,
} from "@/shared/types";

export interface IAtendimentoMetricsProvider {
  getNovosAtendimentos(p: ServiceMetricParams): Promise<INovosAtendimentosResult>;
  getMessageVolume(p: ServiceMetricParams): Promise<IMessageVolumeResult>;
  getMessagesByUser(
    p: ServiceMetricParams & { audience: MetricAudience },
  ): Promise<IMessagesByUserResult>;
  getStatusDistribution(p: ServiceMetricParams): Promise<IStatusDistributionResult>;
  getAccumulatedChats(p: ServiceMetricParams): Promise<IAccumulatedChatsResult>;
  getHandleTimeStats(p: ServiceMetricParams): Promise<IHandleTimeStatsResult>;
}
