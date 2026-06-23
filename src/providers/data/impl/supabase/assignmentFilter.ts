import type { ID } from "@/shared/types";

export interface IAssignmentAny {
  sellerIds?: ID[];
  unassigned?: boolean;
  queue?: boolean;
}

/** Canonical Postgres UUID. Seller ids are UUIDs in production. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Keep only well-formed UUIDs. The token chain feeds the PostgREST `.or()`
 * expression (and the RPC `uuid[]` arg) directly from URL query params, which
 * any authenticated user can hand-edit. Dropping non-UUID tokens prevents a
 * crafted token from breaking out of the `in.(...)` list and injecting sibling
 * filter terms.
 */
export function sanitizeSellerIds(ids: ID[] | undefined): ID[] {
  if (!ids) return [];
  return ids.filter((id) => UUID_RE.test(id));
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
  const sellerIds = sanitizeSellerIds(assignmentAny.sellerIds);
  if (sellerIds.length > 0) {
    terms.push(`assigned_seller_id.in.(${sellerIds.join(",")})`);
  }
  if (assignmentAny.unassigned) terms.push("assigned_seller_id.is.null");
  if (assignmentAny.queue) {
    terms.push("and(assigned_seller_id.is.null,is_sdr_active.eq.false,status.eq.aguardando)");
  }
  return terms.length > 0 ? terms.join(",") : null;
}
