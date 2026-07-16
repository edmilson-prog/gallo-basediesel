import type { IAtendimentoMetricsProvider } from "../../contracts/atendimentoMetrics";
import type { ConversationStatus, IMessagesByUserRow, IConversation } from "@/shared/types";
import { getMockState } from "@/mocks/store/mockStore";
import {
  bucketize,
  averagePerDay,
  deltaPct,
  synthesizeNovoAtendimentoTimestamps,
} from "@/features/service-volume/engine";
import {
  calculateTmaMinutes,
  calculateTmrMinutes,
  calculateResolutionRate,
  calculateBacklog,
} from "@/features/manager-dashboard/utils/kpiMath";

const OPEN_STATUSES = new Set<IConversation["status"]>([
  "aguardando",
  "em_andamento",
  "aguardando_cliente",
]);

function inRange(iso: string, from: string, to: string): boolean {
  const t = new Date(iso).getTime();
  return t >= new Date(from).getTime() && t <= new Date(to).getTime();
}

function scopedConversations(storeId?: string, sellerId?: string) {
  return getMockState().conversations.filter(
    (c) =>
      (!storeId || c.storeId === storeId) &&
      (!sellerId || c.assignedSellerId === sellerId),
  );
}

export const mockAtendimentoMetricsProvider: IAtendimentoMetricsProvider = {
  async getNovosAtendimentos({ storeId, sellerId, from, to, granularity }) {
    const convs = scopedConversations(storeId, sellerId);
    const all = convs.flatMap((c) =>
      synthesizeNovoAtendimentoTimestamps({
        id: c.id,
        createdAt: c.createdAt,
        lastMessageAt: c.lastMessageAt,
        status: c.status,
      }),
    );
    const within = all.filter((ts) => inRange(ts, from, to));
    const series = bucketize(within, granularity);
    // previous period of the same length, half-open [prevFrom, from) so the
    // boundary instant `from` is not double-counted (it belongs to `within`).
    const fromMs = new Date(from).getTime();
    const span = new Date(to).getTime() - fromMs;
    const prevFromMs = fromMs - span;
    const prevWithin = all.filter((ts) => {
      const t = new Date(ts).getTime();
      return t >= prevFromMs && t < fromMs;
    });
    return {
      series,
      total: within.length,
      averagePerDay: averagePerDay(within, from, to),
      deltaPct: deltaPct(within.length, prevWithin.length),
      historyStartsAt: null,
    };
  },

  async getMessageVolume({ storeId, sellerId, from, to, granularity }) {
    const convIds = new Set(scopedConversations(storeId, sellerId).map((c) => c.id));
    const msgs = getMockState().messages.filter(
      (m) => convIds.has(m.conversationId) && inRange(m.sentAt, from, to),
    );
    const sentTs = msgs.filter((m) => m.direction === "out").map((m) => m.sentAt);
    const recvTs = msgs.filter((m) => m.direction === "in").map((m) => m.sentAt);
    const sentB = bucketize(sentTs, granularity);
    const recvB = bucketize(recvTs, granularity);
    const buckets = [...new Set([...sentB, ...recvB].map((b) => b.bucket))].sort();
    const sentMap = new Map(sentB.map((b) => [b.bucket, b.value]));
    const recvMap = new Map(recvB.map((b) => [b.bucket, b.value]));
    return {
      series: buckets.map((bucket) => ({
        bucket,
        sent: sentMap.get(bucket) ?? 0,
        received: recvMap.get(bucket) ?? 0,
      })),
      totalSent: sentTs.length,
      totalReceived: recvTs.length,
    };
  },

  async getMessagesByUser({ storeId, sellerId, from, to, audience }) {
    const convIds = new Set(scopedConversations(storeId, sellerId).map((c) => c.id));
    const sellers = new Map(getMockState().sellers.map((s) => [s.id, s.fullName]));
    const isHuman = (t: string) => t === "seller";
    const isAuto = (t: string) => t === "sdr" || t === "system";
    const counts = new Map<string, IMessagesByUserRow>();
    for (const m of getMockState().messages) {
      if (!convIds.has(m.conversationId)) continue;
      if (m.authorType === "customer") continue; // recebidas não entram em "por usuário"
      if (!inRange(m.sentAt, from, to)) continue;
      if (audience === "human" && !isHuman(m.authorType)) continue;
      if (audience === "automation" && !isAuto(m.authorType)) continue;
      const key = m.authorId ?? `auto:${m.authorType}`;
      const row =
        counts.get(key) ??
        {
          sellerId: m.authorType === "seller" ? (m.authorId ?? null) : null,
          name:
            m.authorType === "seller"
              ? (sellers.get(m.authorId ?? "") ?? "Atendente")
              : m.authorType === "sdr"
                ? "SDR (automação)"
                : "Sistema",
          authorType: m.authorType as "seller" | "sdr" | "system",
          count: 0,
        };
      row.count += 1;
      counts.set(key, row);
    }
    return {
      rows: [...counts.values()].sort((a, b) => b.count - a.count),
      audience,
    };
  },

  async getStatusDistribution({ storeId, sellerId }) {
    const convs = scopedConversations(storeId, sellerId);
    const counts = new Map<ConversationStatus, number>();
    for (const c of convs) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
    const slices = [...counts.entries()].map(([status, count]) => ({ status, count }));
    return { slices, total: convs.length };
  },

  async getAccumulatedChats({ storeId, sellerId, from, to, granularity }) {
    const convs = scopedConversations(storeId, sellerId);
    const created = convs.map((c) => c.createdAt).filter((ts) => inRange(ts, from, to));
    const series = bucketize(created, granularity);
    let running = 0;
    const cumulative = series.map((b) => {
      running += b.value;
      return { bucket: b.bucket, value: running };
    });
    return { series: cumulative, total: convs.length };
  },

  async getHandleTimeStats({ storeId, sellerId, from, to }) {
    const convs = scopedConversations(storeId, sellerId).filter((c) =>
      inRange(c.createdAt, from, to),
    );
    const durations = convs
      .map((c) => new Date(c.lastMessageAt).getTime() - new Date(c.createdAt).getTime())
      .filter((d) => d > 0)
      .sort((a, b) => a - b);
    if (durations.length === 0) {
      return { averageMs: 0, medianMs: null, cycleCount: 0, deltaPct: null };
    }
    const sum = durations.reduce((a, d) => a + d, 0);
    const median = durations[Math.floor(durations.length / 2)];
    return {
      averageMs: Math.round(sum / durations.length),
      medianMs: median,
      cycleCount: durations.length,
      deltaPct: null,
    };
  },

  async getHeadlineKpis({ storeId, sellerId, from, to, prevFrom, prevTo }) {
    const convs = scopedConversations(storeId, sellerId);
    const convIds = new Set(convs.map((c) => c.id));
    const allMessages = getMockState().messages.filter((m) => convIds.has(m.conversationId));

    const openConversations = convs.filter((c) => OPEN_STATUSES.has(c.status));
    const conversationsInPeriod = convs.filter((c) => inRange(c.lastMessageAt, from, to));
    const conversationsInPrev = convs.filter((c) => inRange(c.lastMessageAt, prevFrom, prevTo));
    const messagesInPeriod = allMessages.filter((m) => inRange(m.sentAt, from, to));
    const messagesInPrev = allMessages.filter((m) => inRange(m.sentAt, prevFrom, prevTo));

    return {
      tmaMinutes: {
        current: calculateTmaMinutes(conversationsInPeriod, messagesInPeriod),
        previous: calculateTmaMinutes(conversationsInPrev, messagesInPrev),
      },
      tmrMinutes: {
        current: calculateTmrMinutes(messagesInPeriod),
        previous: calculateTmrMinutes(messagesInPrev),
      },
      resolutionRatePct: {
        current: calculateResolutionRate(conversationsInPeriod),
        previous: calculateResolutionRate(conversationsInPrev),
      },
      backlog: calculateBacklog(openConversations),
    };
  },
};
