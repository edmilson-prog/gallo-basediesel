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
