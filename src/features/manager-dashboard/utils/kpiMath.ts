import type { IConversation, IMessage } from "@/shared/types";

/**
 * Average response time (minutes) between an inbound customer message and the
 * first seller reply that follows it inside the same conversation.
 *
 * Algorithm: walk messages sorted by `sentAt` per conversation. Track the last
 * unanswered inbound message; when an outbound seller message arrives, record
 * the delta and clear the marker. SDR / system messages are ignored so the
 * metric truly measures human response time.
 *
 * Returns null when no valid in→out pair exists.
 */
export function calculateTmrMinutes(messages: IMessage[]): number | null {
  const byConv = new Map<string, IMessage[]>();
  for (const m of messages) {
    const bucket = byConv.get(m.conversationId) ?? [];
    bucket.push(m);
    byConv.set(m.conversationId, bucket);
  }

  const deltas: number[] = [];
  for (const list of byConv.values()) {
    const sorted = [...list].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    let lastInboundAt: number | null = null;
    for (const msg of sorted) {
      if (msg.direction === "in" && msg.authorType === "customer") {
        if (lastInboundAt === null) lastInboundAt = new Date(msg.sentAt).getTime();
      } else if (msg.direction === "out" && msg.authorType === "seller") {
        if (lastInboundAt !== null) {
          const delta = new Date(msg.sentAt).getTime() - lastInboundAt;
          if (delta >= 0) deltas.push(delta);
          lastInboundAt = null;
        }
      }
    }
  }

  if (deltas.length === 0) return null;
  const avgMs = deltas.reduce((acc, d) => acc + d, 0) / deltas.length;
  return Math.round(avgMs / 60_000);
}

/**
 * Average handling time (minutes) of resolved conversations in the window.
 *
 * Approximated from the conversation lifecycle (PRD note: real audit-log
 * timestamps land on Fase 2). For each conversation with `status === "resolvida"`
 * whose `lastMessageAt` falls in the window, the TMA is the span between its
 * earliest customer message and `lastMessageAt`.
 */
export function calculateTmaMinutes(
  conversations: IConversation[],
  messages: IMessage[],
): number | null {
  const firstCustomerByConv = new Map<string, number>();
  for (const m of messages) {
    if (m.direction !== "in" || m.authorType !== "customer") continue;
    const t = new Date(m.sentAt).getTime();
    const prev = firstCustomerByConv.get(m.conversationId);
    if (prev === undefined || t < prev) firstCustomerByConv.set(m.conversationId, t);
  }

  const deltas: number[] = [];
  for (const conv of conversations) {
    if (conv.status !== "resolvida") continue;
    const start = firstCustomerByConv.get(conv.id);
    if (start === undefined) continue;
    const end = new Date(conv.lastMessageAt).getTime();
    if (end >= start) deltas.push(end - start);
  }

  if (deltas.length === 0) return null;
  const avgMs = deltas.reduce((acc, d) => acc + d, 0) / deltas.length;
  return Math.round(avgMs / 60_000);
}

/**
 * Resolution rate (percentage) over the window — resolved over opened.
 *
 * Opened := conversations with `lastMessageAt` in the window AND a non-archived
 * status; Resolved := opened conversations with status `resolvida`.
 */
export function calculateResolutionRate(conversations: IConversation[]): number | null {
  const opened = conversations.filter((c) => c.status !== "arquivada");
  if (opened.length === 0) return null;
  const resolved = opened.filter((c) => c.status === "resolvida");
  return Math.round((resolved.length / opened.length) * 100);
}

/**
 * Current count of conversations sitting in `aguardando`. Ignores the window
 * — backlog is always "right now". The provider snapshot already restricted
 * `openConversations` to the active scope.
 */
export function calculateBacklog(openConversations: IConversation[]): number {
  return openConversations.filter((c) => c.status === "aguardando").length;
}

/**
 * Trend direction comparing current vs previous value.
 * `null` previous (or zero base for a positive metric) is treated as flat.
 */
export type TrendDirection = "up" | "down" | "flat";

export interface ITrendInfo {
  direction: TrendDirection;
  /** Percent change as integer (sign preserved). Null when no comparison possible. */
  changePct: number | null;
  /** True when this trend should render in green ("good"). */
  isImprovement: boolean;
}

/**
 * Compute a trend between current and previous values for a metric where
 * `lowerIsBetter` decides which direction counts as improvement (TMA/TMR/Backlog
 * shrink to improve; Resolution Rate grows to improve).
 */
export function computeTrend(
  current: number | null,
  previous: number | null,
  lowerIsBetter: boolean,
): ITrendInfo {
  if (current === null || previous === null) {
    return { direction: "flat", changePct: null, isImprovement: false };
  }
  if (previous === 0 && current === 0) {
    return { direction: "flat", changePct: 0, isImprovement: false };
  }
  if (previous === 0) {
    const direction: TrendDirection = current > 0 ? "up" : "down";
    return {
      direction,
      changePct: null,
      isImprovement: lowerIsBetter ? direction === "down" : direction === "up",
    };
  }
  const diff = current - previous;
  const pct = Math.round((diff / previous) * 100);
  if (pct === 0) {
    return { direction: "flat", changePct: 0, isImprovement: false };
  }
  const direction: TrendDirection = pct > 0 ? "up" : "down";
  const isImprovement = lowerIsBetter ? direction === "down" : direction === "up";
  return { direction, changePct: pct, isImprovement };
}
