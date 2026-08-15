/**
 * Waiting-queue rules for the atendimento PWA.
 *
 * The severity thresholds are NOT redefined here — they come from the Inbox's
 * `waitTime` engine so the phone and the desk agree on when a conversation
 * turns amber and when it turns red.
 */
import type { ID, IConversation } from "@/shared/types";
import type { IListConversationsParams } from "@/providers/data";
import { waitSeverity } from "@/features/conversations/engine/waitTime";
import { PWA_OPEN_STATUSES } from "./pwaFilters";

/** A conversation paired with how long it has been waiting, in milliseconds. */
export interface IQueueEntry {
  conversation: IConversation;
  waitMs: number;
}

export interface IQueueCounters {
  /** Waiting at or beyond the critical threshold (30 min). */
  critical: number;
  /** Waiting at or beyond the warning threshold but below critical (10–30 min). */
  warning: number;
  /** Every eligible entry, whatever its severity. */
  total: number;
}

/**
 * Longest wait first. Ties break by conversation id so a re-render caused by
 * the shared clock tick never reshuffles two rows that waited the same amount.
 */
export function sortQueue<T extends IQueueEntry>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    if (b.waitMs !== a.waitMs) return b.waitMs - a.waitMs;
    return a.conversation.id.localeCompare(b.conversation.id);
  });
}

/** Each entry lands in exactly one severity bucket — the counters never overlap. */
export function countQueue(entries: readonly IQueueEntry[]): IQueueCounters {
  let critical = 0;
  let warning = 0;
  for (const entry of entries) {
    const severity = waitSeverity(entry.waitMs);
    if (severity === "critical") critical += 1;
    else if (severity === "warning") warning += 1;
  }
  return { critical, warning, total: entries.length };
}

/** A closed conversation is out of the queue, however long it once waited. */
export function isQueueEligible(conversation: IConversation): boolean {
  return conversation.status !== "resolvida" && conversation.status !== "arquivada";
}

/**
 * Provider parameters for the waiting screen.
 *
 * Two decisions worth stating. Only **pool** conversations are queried, because
 * `queuedAt` — the authoritative wait clock, written by a DB trigger — is set
 * only while a conversation sits in the manual-distribution queue. And the sort
 * is `lastMessageAt` **ascending**: the provider has no `queuedAt` ordering, and
 * for a queued conversation the last message is the customer's, so the oldest
 * one is the person who has been waiting longest. The rows are then re-sorted by
 * the real `queuedAt` on the client, so what the counter shows and what the
 * order implies never disagree on screen.
 */
export function pwaQueueListParams(ctx: { storeId: ID | null }): IListConversationsParams {
  const params: IListConversationsParams = {
    status: PWA_OPEN_STATUSES,
    assignmentAny: { queue: true },
    orderBy: "lastMessageAt",
    orderDir: "asc",
  };
  if (ctx.storeId) params.storeId = ctx.storeId;
  return params;
}
