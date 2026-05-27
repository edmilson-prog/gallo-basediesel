import type {
  ConversationChannel,
  IChannelServiceMetrics,
  IConversation,
  ICustomerServiceDailyPoint,
  ICustomerServiceKpis,
  ICustomerServiceMetrics,
  ICustomerServiceMonthlyPoint,
  ID,
  IEscalationBreakdown,
  IMessage,
  IOrder,
  ISdrEscalation,
  ISeller,
  ISellerServiceMetrics,
  SdrEscalationReason,
} from "@/shared/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const MONTHS_PT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const REASON_KEYS: SdrEscalationReason[] = [
  "customer_requested",
  "negotiation_detected",
  "sdr_failed",
  "complexity",
  "out_of_scope",
];

export type ServiceChannelKey = ConversationChannel | "sdr" | "outros";

const round = (value: number, places = 2): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const ratio = (n: number, d: number): number => (d === 0 ? 0 : n / d);

const isResolved = (status: IConversation["status"]): boolean =>
  status === "resolvida" || status === "arquivada";

const isOpen = (status: IConversation["status"]): boolean =>
  status === "aguardando" || status === "em_andamento" || status === "aguardando_cliente";

interface IConversationStat {
  conversation: IConversation;
  handleTime: number | null;
  responseTime: number | null;
  hadConversion: boolean;
  hadEscalation: boolean;
}

function buildConversationStats(
  conversations: IConversation[],
  messages: IMessage[],
  paidOrders: IOrder[],
  escalations: ISdrEscalation[],
): IConversationStat[] {
  const messagesByConv = new Map<ID, IMessage[]>();
  for (const m of messages) {
    const arr = messagesByConv.get(m.conversationId) ?? [];
    arr.push(m);
    messagesByConv.set(m.conversationId, arr);
  }
  for (const arr of messagesByConv.values()) {
    arr.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  }

  const ordersByCustomer = new Map<ID, IOrder[]>();
  for (const order of paidOrders) {
    const arr = ordersByCustomer.get(order.customerId) ?? [];
    arr.push(order);
    ordersByCustomer.set(order.customerId, arr);
  }

  const escalationsByConv = new Set<ID>();
  for (const esc of escalations) {
    if (esc.conversationId) escalationsByConv.add(esc.conversationId);
  }

  return conversations.map((conversation) => {
    const msgs = messagesByConv.get(conversation.id) ?? [];
    const created = new Date(conversation.createdAt).getTime();
    const last = new Date(conversation.lastMessageAt).getTime();
    const handleTime =
      isResolved(conversation.status) && Number.isFinite(created) && Number.isFinite(last)
        ? Math.max(0, last - created)
        : null;

    // TMR: first inbound message → first outbound human (seller) message.
    let responseTime: number | null = null;
    const firstInbound = msgs.find((m) => m.direction === "in");
    if (firstInbound) {
      const firstOutHuman = msgs.find(
        (m) => m.direction === "out" && (m.authorType === "seller" || m.authorType === "sdr"),
      );
      if (firstOutHuman) {
        const diff =
          new Date(firstOutHuman.sentAt).getTime() - new Date(firstInbound.sentAt).getTime();
        responseTime = Math.max(0, diff);
      }
    }

    const hadConversion = (() => {
      if (!conversation.customerId) return false;
      const orders = ordersByCustomer.get(conversation.customerId) ?? [];
      const convCreated = created;
      return orders.some((o) => {
        const orderCreated = new Date(o.createdAt).getTime();
        return orderCreated >= convCreated;
      });
    })();

    return {
      conversation,
      handleTime,
      responseTime,
      hadConversion,
      hadEscalation: escalationsByConv.has(conversation.id),
    };
  });
}

function buildKpis(stats: IConversationStat[]): ICustomerServiceKpis {
  let resolved = 0;
  let open = 0;
  let conversions = 0;
  let escalations = 0;
  let handleSum = 0;
  let handleCount = 0;
  let responseSum = 0;
  let responseCount = 0;
  for (const stat of stats) {
    const status = stat.conversation.status;
    if (isResolved(status)) resolved += 1;
    if (isOpen(status)) open += 1;
    if (stat.hadConversion) conversions += 1;
    if (stat.hadEscalation) escalations += 1;
    if (stat.handleTime != null) {
      handleSum += stat.handleTime;
      handleCount += 1;
    }
    if (stat.responseTime != null) {
      responseSum += stat.responseTime;
      responseCount += 1;
    }
  }
  return {
    totalConversations: stats.length,
    averageHandleTime: handleCount === 0 ? 0 : Math.round(handleSum / handleCount),
    averageResponseTime: responseCount === 0 ? 0 : Math.round(responseSum / responseCount),
    resolutionRate: ratio(resolved - escalations, stats.length),
    conversionRate: ratio(conversions, stats.length),
    resolvedCount: resolved,
    openCount: open,
    escalationCount: escalations,
  };
}

function channelKey(channel: ConversationChannel, isSdr: boolean): ServiceChannelKey {
  if (isSdr) return "sdr";
  return channel;
}

function deriveHealthScore(kpis: ICustomerServiceKpis): number {
  // Higher resolution + conversion, lower TMR (minutes). Composite 0..100.
  const resolution = Math.max(0, Math.min(1, kpis.resolutionRate));
  const conversion = Math.max(0, Math.min(1, kpis.conversionRate));
  const tmrMinutes = kpis.averageResponseTime / 60_000;
  // TMR score: 100 if ≤5min, 0 if ≥120min, linear in between.
  const tmrScore = tmrMinutes <= 5 ? 1 : tmrMinutes >= 120 ? 0 : 1 - (tmrMinutes - 5) / 115;
  return Math.round(resolution * 50 + conversion * 30 + tmrScore * 20);
}

function bucketStatsByMonth(stats: IConversationStat[]): Map<string, IConversationStat[]> {
  const out = new Map<string, IConversationStat[]>();
  for (const stat of stats) {
    const key = stat.conversation.createdAt.slice(0, 7);
    const arr = out.get(key) ?? [];
    arr.push(stat);
    out.set(key, arr);
  }
  return out;
}

function buildTrendMonthly(
  stats: IConversationStat[],
  startIso: string,
  endIso: string,
): ICustomerServiceMonthlyPoint[] {
  const buckets = bucketStatsByMonth(stats);
  const start = new Date(startIso);
  const end = new Date(endIso);
  const out: ICustomerServiceMonthlyPoint[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor.getTime() <= end.getTime()) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(key) ?? [];
    const kpis = buildKpis(bucket);
    out.push({
      monthKey: key,
      monthLabel: `${MONTHS_PT[cursor.getUTCMonth()]}/${String(cursor.getUTCFullYear()).slice(2)}`,
      totalConversations: kpis.totalConversations,
      averageHandleTime: kpis.averageHandleTime,
      averageResponseTime: kpis.averageResponseTime,
      resolutionRate: round(kpis.resolutionRate, 4),
      conversionRate: round(kpis.conversionRate, 4),
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

function buildTrendDaily(
  stats: IConversationStat[],
  startIso: string,
  endIso: string,
): ICustomerServiceDailyPoint[] {
  const buckets = new Map<string, number>();
  for (const stat of stats) {
    const key = stat.conversation.createdAt.slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const out: ICustomerServiceDailyPoint[] = [];
  for (let t = startMs; t <= endMs; t += MS_PER_DAY) {
    const date = new Date(t);
    const key = date.toISOString().slice(0, 10);
    out.push({ dayKey: key, totalConversations: buckets.get(key) ?? 0 });
  }
  return out;
}

export interface ICustomerServiceEngineContext {
  conversations: IConversation[];
  /** Conversations from the immediately previous window (same length). */
  conversationsPrevious?: IConversation[];
  messages: IMessage[];
  paidOrders: IOrder[];
  escalations: ISdrEscalation[];
  sellers: ISeller[];
  /** Period boundaries (createdAt filter is applied upstream). */
  period: { start: string; end: string };
}

/**
 * Pure engine for PRD-051 — composes KPIs, channel/seller breakdowns, monthly +
 * daily trends and the escalation breakdown. Inputs are already scoped (store,
 * seller, period) by the upstream hook.
 */
export function calculateCustomerServiceMetrics(
  ctx: ICustomerServiceEngineContext,
): ICustomerServiceMetrics {
  const stats = buildConversationStats(
    ctx.conversations,
    ctx.messages,
    ctx.paidOrders,
    ctx.escalations,
  );
  const totals = buildKpis(stats);

  // ─── Per-channel ─────────────────────────────────────────────────────────
  const channelBuckets = new Map<ServiceChannelKey, IConversationStat[]>();
  for (const stat of stats) {
    const key = channelKey(stat.conversation.channel, stat.conversation.isSdrActive);
    const bucket = channelBuckets.get(key) ?? [];
    bucket.push(stat);
    channelBuckets.set(key, bucket);
  }
  const byChannel: IChannelServiceMetrics[] = Array.from(channelBuckets.entries()).map(
    ([channel, bucket]) => ({
      channel,
      ...buildKpis(bucket),
    }),
  );
  byChannel.sort((a, b) => b.totalConversations - a.totalConversations);

  // ─── Per-seller ──────────────────────────────────────────────────────────
  const sellerName = new Map<ID, string>();
  for (const s of ctx.sellers) sellerName.set(s.id, s.fullName);

  const sellerBuckets = new Map<ID, IConversationStat[]>();
  for (const stat of stats) {
    const seller = stat.conversation.assignedSellerId;
    if (!seller) continue;
    const bucket = sellerBuckets.get(seller) ?? [];
    bucket.push(stat);
    sellerBuckets.set(seller, bucket);
  }
  const bySeller: ISellerServiceMetrics[] = Array.from(sellerBuckets.entries()).map(
    ([sellerId, bucket]) => {
      const kpis = buildKpis(bucket);
      return {
        sellerId,
        sellerName: sellerName.get(sellerId) ?? "(vendedor removido)",
        ...kpis,
        healthScore: deriveHealthScore(kpis),
      };
    },
  );
  bySeller.sort((a, b) => b.healthScore - a.healthScore);

  // ─── Escalations ─────────────────────────────────────────────────────────
  const escByReason: Record<SdrEscalationReason, number> = {
    customer_requested: 0,
    negotiation_detected: 0,
    sdr_failed: 0,
    complexity: 0,
    out_of_scope: 0,
  };
  const escBySeller = new Map<ID, number>();
  for (const esc of ctx.escalations) {
    if (REASON_KEYS.includes(esc.reason)) escByReason[esc.reason] += 1;
    if (esc.assignedSellerId) {
      escBySeller.set(esc.assignedSellerId, (escBySeller.get(esc.assignedSellerId) ?? 0) + 1);
    }
  }
  const escalations: IEscalationBreakdown = {
    total: ctx.escalations.length,
    byReason: escByReason,
    bySeller: Array.from(escBySeller.entries())
      .map(([sellerId, total]) => ({
        sellerId,
        sellerName: sellerName.get(sellerId) ?? "(vendedor removido)",
        total,
      }))
      .sort((a, b) => b.total - a.total),
  };

  // ─── Previous-period comparative ─────────────────────────────────────────
  let previous: ICustomerServiceKpis | null = null;
  if (ctx.conversationsPrevious) {
    const prevStats = buildConversationStats(
      ctx.conversationsPrevious,
      ctx.messages,
      ctx.paidOrders,
      ctx.escalations,
    );
    previous = buildKpis(prevStats);
  }

  return {
    period: { start: ctx.period.start, end: ctx.period.end },
    totals,
    previous,
    byChannel,
    bySeller,
    trendMonthly: buildTrendMonthly(stats, ctx.period.start, ctx.period.end),
    trendDaily: buildTrendDaily(stats, ctx.period.start, ctx.period.end),
    escalations,
  };
}

/** Compute the % delta of `current` vs `base` for headers. Null when undefined. */
export function deltaPctOf(current: number, base: number): number | null {
  if (base === 0) return null;
  return (current - base) / base;
}
