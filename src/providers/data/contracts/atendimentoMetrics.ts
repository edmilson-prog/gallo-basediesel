import type {
  ServiceMetricParams,
  MetricAudience,
  INovosAtendimentosResult,
  IMessageVolumeResult,
  IMessagesByUserResult,
  IStatusDistributionResult,
  IAccumulatedChatsResult,
  IHandleTimeStatsResult,
  IHeadlineKpisParams,
  IHeadlineKpisResult,
  ISellerLoadParams,
  ISellerLoadCountsResult,
  IHeatmapParams,
  IHeatmapResult,
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
  /** The "Indicadores principais" row — TMA/TMR/Taxa de Resolução/Backlog (PRD-214 follow-up). */
  getHeadlineKpis(p: IHeadlineKpisParams): Promise<IHeadlineKpisResult>;
  /** "Carga por vendedor" — open conversations per assigned seller (current-state). */
  getSellerLoad(p: ISellerLoadParams): Promise<ISellerLoadCountsResult>;
  /** "Heatmap de volume" — inbound customer messages per (weekday × hour). */
  getVolumeHeatmap(p: IHeatmapParams): Promise<IHeatmapResult>;
}
