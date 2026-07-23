import type { IAuditLog, ID } from "@/shared/types";

export interface ITransferClosure {
  actorId: ID;
  timestamp: string;
}

/**
 * Indexes `transfer.revert`/`transfer.expire` audit entries by transfer id, so
 * the Histórico table can show who closed a transfer and when — data
 * `carteira_transfers` itself never carried (only `created_by`/`created_at`).
 *
 * Callers must pass `entries` newest-first (the audits provider already
 * returns them that way): the first entry seen per `resourceId` wins, so a
 * transfer closed more than once over its lifetime (shouldn't happen, but the
 * schema doesn't prevent it) resolves to its most recent closure.
 */
export function buildClosureIndex(entries: IAuditLog[]): Map<ID, ITransferClosure> {
  const index = new Map<ID, ITransferClosure>();
  for (const entry of entries) {
    if (index.has(entry.resourceId)) continue;
    index.set(entry.resourceId, { actorId: entry.actorId, timestamp: entry.timestamp });
  }
  return index;
}
