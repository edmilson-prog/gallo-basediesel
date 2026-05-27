import type { ConversationChannel } from "./conversation";
import type { ID, ISO8601 } from "./common";
import type { SdrEscalationReason } from "./sdr-escalation";

/** Aggregated KPIs for a single dimension slice (seller/channel/period). */
export interface ICustomerServiceKpis {
  totalConversations: number;
  /** Tempo Médio de Atendimento — `createdAt → lastMessageAt`, ms. */
  averageHandleTime: number;
  /** Tempo Médio de Resposta — first inbound → first outbound human, ms. */
  averageResponseTime: number;
  /** Decimal 0..1 — resolved without escalation. */
  resolutionRate: number;
  /** Decimal 0..1 — conversations that converted into a paid order. */
  conversionRate: number;
  /** Conversas resolvidas (status `resolvida` ou `arquivada`). */
  resolvedCount: number;
  /** Conversas que ainda estão abertas no período. */
  openCount: number;
  /** Escalações vinculadas às conversas do recorte. */
  escalationCount: number;
}

export interface IChannelServiceMetrics extends ICustomerServiceKpis {
  channel: ConversationChannel | "sdr" | "outros";
}

export interface ISellerServiceMetrics extends ICustomerServiceKpis {
  sellerId: ID;
  sellerName: string;
  /** Composite 0..100 health score combining resolution, conversion and TMR. */
  healthScore: number;
}

/** Per-month point used by the evolution chart (PRD-051 RF-013). */
export interface ICustomerServiceMonthlyPoint {
  monthKey: string;
  monthLabel: string;
  totalConversations: number;
  averageHandleTime: number;
  averageResponseTime: number;
  resolutionRate: number;
  conversionRate: number;
}

/** Per-day point used by the volume chart (PRD-051 RF-014). */
export interface ICustomerServiceDailyPoint {
  dayKey: string;
  totalConversations: number;
}

export interface IEscalationBreakdown {
  total: number;
  byReason: Record<SdrEscalationReason, number>;
  /** Per-seller view used by the "top vendedores que recebem" table. */
  bySeller: { sellerId: ID; sellerName: string; total: number }[];
}

/**
 * Consolidated payload computed by `calculateCustomerServiceMetrics` (PRD-051).
 */
export interface ICustomerServiceMetrics {
  period: { start: ISO8601; end: ISO8601 };
  totals: ICustomerServiceKpis;
  /** Comparativo com o mesmo intervalo imediatamente anterior. */
  previous: ICustomerServiceKpis | null;
  byChannel: IChannelServiceMetrics[];
  bySeller: ISellerServiceMetrics[];
  trendMonthly: ICustomerServiceMonthlyPoint[];
  trendDaily: ICustomerServiceDailyPoint[];
  escalations: IEscalationBreakdown;
}
