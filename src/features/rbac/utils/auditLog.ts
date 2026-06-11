import type { ID } from "@/shared/types";
import { recordAuditLog } from "@/providers/data";
import { readCurrentUserSync } from "@/features/auth/guards";
import { getCurrentContext } from "@/features/multistore/utils/getCurrentContext";

export interface IAuditLogParams {
  action: string;
  resource: string;
  resourceId: ID;
  before?: unknown;
  after?: unknown;
  /** Override the actor — defaults to the currently signed-in user. */
  actorId?: ID;
  /** Override the store — defaults to the active store of the session. */
  storeId?: ID;
}

/**
 * Fallback store id used when no current store is resolved (e.g. an audit
 * fired before `<MultistoreProvider>` finishes hydrating). Matches the seed
 * matriz so MVP entries stay consistent.
 */
const FALLBACK_STORE_ID = "00000000-0000-0000-0000-000000000001";

/** Used when no user is authenticated (anonymous events shouldn't normally log). */
const SYSTEM_ACTOR_ID = "system";

/**
 * Fire-and-forget audit log entry.
 *
 * Never throws — failure to write a log must never break the user action.
 * Designed to be called from:
 *  - mock provider implementations (after a successful mutation)
 *  - auth flows (sign-in / sign-out)
 *  - the multi-store layer (PRD-007 — `switch_store` events)
 *  - any business component that performs a sensitive action
 *
 * ⚠️ Always pass a `resourceId`. For events not tied to a resource (sign-in),
 * use the actor id as resource id.
 */
export function auditLog(params: IAuditLogParams): void {
  const user = readCurrentUserSync();
  // The audit trail references SELLERS (audit_logs.actor_id FK → sellers.id on
  // Supabase) — prefer the linked seller over the auth/profile id (#49 family).
  const actorId = params.actorId ?? user?.sellerId ?? user?.id ?? SYSTEM_ACTOR_ID;
  const { currentStoreId } = getCurrentContext();
  void recordAuditLog({
    actorId,
    action: params.action,
    resource: params.resource,
    resourceId: params.resourceId,
    storeId: params.storeId ?? currentStoreId ?? FALLBACK_STORE_ID,
    before: params.before,
    after: params.after,
  });
}
