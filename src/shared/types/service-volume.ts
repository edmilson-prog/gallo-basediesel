import type { ID, ISO8601 } from "./common";
import type { ConversationStatus } from "./conversation";

export type Granularity = "day" | "week" | "month";
export interface MetricBucket {
  bucket: string;
  value: number;
}

export interface ServiceMetricParams {
  storeId?: ID;
  sellerId?: ID;
  from: ISO8601;
  to: ISO8601;
  granularity: Granularity;
}

export interface INovosAtendimentosResult {
  series: MetricBucket[];
  total: number;
  averagePerDay: number;
  deltaPct: number | null;
  /** Reservado p/ o aviso forward-only do PRD-214; null no mock. */
  historyStartsAt: ISO8601 | null;
}

export interface IMessageVolumePoint {
  bucket: string;
  sent: number;
  received: number;
}
export interface IMessageVolumeResult {
  series: IMessageVolumePoint[];
  totalSent: number;
  totalReceived: number;
}

export type MetricAudience = "human" | "automation" | "all";
export interface IMessagesByUserRow {
  sellerId: ID | null;
  name: string;
  authorType: "seller" | "sdr" | "system";
  count: number;
}
export interface IMessagesByUserResult {
  rows: IMessagesByUserRow[];
  audience: MetricAudience;
}

export interface IStatusDistributionSlice {
  status: ConversationStatus;
  count: number;
}
export interface IStatusDistributionResult {
  slices: IStatusDistributionSlice[];
  total: number;
}

export interface IAccumulatedChatsResult {
  series: MetricBucket[];
  total: number;
}

export interface IHandleTimeStatsResult {
  averageMs: number;
  medianMs: number | null;
  cycleCount: number;
  deltaPct: number | null;
}

export interface IHeadlineKpisParams {
  storeId?: ID;
  sellerId?: ID;
  from: ISO8601;
  to: ISO8601;
  prevFrom: ISO8601;
  prevTo: ISO8601;
}

export interface IKpiTrendValue {
  current: number | null;
  previous: number | null;
}

/**
 * The four "Indicadores principais" headline KPIs (PRD-214 follow-up).
 * `backlog` has no `previous` — it's a current-state snapshot ("aguardando"
 * right now), not windowed.
 */
export interface IHeadlineKpisResult {
  tmaMinutes: IKpiTrendValue;
  tmrMinutes: IKpiTrendValue;
  resolutionRatePct: IKpiTrendValue;
  backlog: number;
}

/** "Carga por vendedor" — current-state, ignores the time window. */
export interface ISellerLoadParams {
  storeId?: ID;
  sellerId?: ID;
}

export interface ISellerLoadCountRow {
  sellerId: ID;
  activeCount: number;
}

export interface ISellerLoadCountsResult {
  rows: ISellerLoadCountRow[];
}

/** "Heatmap de volume" — inbound customer messages per (weekday × hour). */
export interface IHeatmapParams {
  storeId?: ID;
  sellerId?: ID;
  from: ISO8601;
  to: ISO8601;
}

/** `day` is 0=domingo..6=sábado (same convention as JS `Date#getDay()`). */
export interface IHeatmapCellRow {
  day: number;
  hour: number;
  count: number;
}

export interface IHeatmapResult {
  rows: IHeatmapCellRow[];
  totalMessages: number;
}
