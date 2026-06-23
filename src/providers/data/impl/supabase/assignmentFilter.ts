import type { ID } from "@/shared/types";

export interface IAssignmentAny {
  sellerIds?: ID[];
  unassigned?: boolean;
  queue?: boolean;
}

/**
 * Compose a PostgREST `.or()` argument for the Inbox combined assignment filter.
 * Each selected criterion becomes one OR term; the queue is a nested `and(...)`
 * so its pool/SDR/status constraints stay scoped to that term (they must not
 * pin the global status filter). Returns `null` when no criterion is set, so the
 * caller skips `.or()` entirely ("Todas" === no assignment constraint).
 */
export function buildAssignmentOrFilter(assignmentAny: IAssignmentAny | undefined): string | null {
  if (!assignmentAny) return null;
  const terms: string[] = [];
  if (assignmentAny.sellerIds && assignmentAny.sellerIds.length > 0) {
    terms.push(`assigned_seller_id.in.(${assignmentAny.sellerIds.join(",")})`);
  }
  if (assignmentAny.unassigned) terms.push("assigned_seller_id.is.null");
  if (assignmentAny.queue) {
    terms.push("and(assigned_seller_id.is.null,is_sdr_active.eq.false,status.eq.aguardando)");
  }
  return terms.length > 0 ? terms.join(",") : null;
}
