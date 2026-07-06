/**
 * Attendance-history timeline builder (Frente 2, PRD attendance-close-and-history).
 *
 * Pure function — no I/O, no Date.now(): groups the flat activity feed
 * (`IConversationActivityEvent[]`) by conversation, orders nodes chronologically,
 * and derives per-node duration and per-group summary purely from the events'
 * own `createdAt` timestamps.
 */

import type { ConversationChannel, ConversationStatus, ID, IConversationActivityEvent } from "@/shared/types";

/** One node in a conversation's timeline — the raw event plus its computed duration. */
export interface ITimelineNode {
  event: IConversationActivityEvent;
  /** Milliseconds until the next node in the same conversation. `null` for the last node. */
  durationMs: number | null;
}

/** Aggregate stats for a conversation's timeline. */
export interface ITimelineSummary {
  eventCount: number;
  /** Last `toSellerId` seen — `null` if the conversation ended without an owner (closed). */
  finalSellerId: ID | null;
  /** Span from the first to the last node in the group. */
  totalDurationMs: number;
  /** Count of `assignment` events carrying a non-null `toSellerId`. */
  transferCount: number;
}

/** One conversation's grouped attendance timeline. */
export interface IConversationTimeline {
  conversationId: ID;
  channel: ConversationChannel;
  currentStatus: ConversationStatus;
  createdAt: string;
  nodes: ITimelineNode[];
  summary: ITimelineSummary;
}

/**
 * Groups a flat activity feed by conversation, sorts conversations by
 * most-recent activity (desc) and nodes within a conversation by `createdAt`
 * (asc), then derives per-node duration and per-group summary.
 */
export function buildAttendanceTimeline(events: IConversationActivityEvent[]): IConversationTimeline[] {
  const groups = new Map<ID, IConversationActivityEvent[]>();
  for (const event of events) {
    const bucket = groups.get(event.conversationId);
    if (bucket) {
      bucket.push(event);
    } else {
      groups.set(event.conversationId, [event]);
    }
  }

  const timelines: IConversationTimeline[] = [];
  for (const [conversationId, groupEvents] of groups) {
    const sorted = [...groupEvents].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    );

    const nodes: ITimelineNode[] = sorted.map((event, index) => {
      const next = sorted[index + 1];
      const durationMs = next ? Date.parse(next.createdAt) - Date.parse(event.createdAt) : null;
      return { event, durationMs };
    });

    const summary = summarize(sorted);
    const last = sorted[sorted.length - 1]!;

    timelines.push({
      conversationId,
      channel: last.conversationChannel,
      currentStatus: last.conversationStatus,
      createdAt: last.conversationCreatedAt,
      nodes,
      summary,
    });
  }

  return timelines.sort((a, b) => {
    const lastA = a.nodes[a.nodes.length - 1]?.event.createdAt ?? a.createdAt;
    const lastB = b.nodes[b.nodes.length - 1]?.event.createdAt ?? b.createdAt;
    return Date.parse(lastB) - Date.parse(lastA);
  });
}

function summarize(sortedEvents: IConversationActivityEvent[]): ITimelineSummary {
  let finalSellerId: ID | null = null;
  let transferCount = 0;
  let hasOwner = false;

  for (const event of sortedEvents) {
    // Participant add/remove carry the COLLABORATOR in toSellerId, not an owner
    // delta — they must never move the conversation's final owner (a collaborator
    // is not the assignee). Owner tracking is for created/status/assignment/reopen.
    const isParticipantEvent =
      event.type === "participant_add" || event.type === "participant_remove";
    // Any owner-bearing event (not just `assignment` rows) updates the final
    // owner — a `status` row can drop the owner too (e.g. a CLOSE event clearing
    // `toSellerId` alongside the status change). No-op events (no seller change)
    // have both `fromSellerId` and `toSellerId` null, so require at least one
    // side to be non-null to count as a real delta.
    if (!isParticipantEvent && (event.fromSellerId != null || event.toSellerId != null)) {
      finalSellerId = event.toSellerId ?? null;
    }
    if (event.type === "assignment" && event.toSellerId) {
      // The first owner acquisition is not a reassignment — only count transfers
      // that hand the conversation off from a prior owner.
      if (hasOwner) transferCount += 1;
      hasOwner = true;
    }
  }

  const first = sortedEvents[0]!;
  const last = sortedEvents[sortedEvents.length - 1]!;
  const totalDurationMs = Date.parse(last.createdAt) - Date.parse(first.createdAt);

  return {
    eventCount: sortedEvents.length,
    finalSellerId,
    totalDurationMs,
    transferCount,
  };
}
