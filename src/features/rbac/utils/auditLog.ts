import type { ID } from "@/shared/types";
import { recordAuditLog } from "@/providers/data";
import { readCurrentUserSync } from "@/features/auth/guards";

export interface IAuditLogParams {
  action: string;
  resource: string;
  resourceId: ID;
  before?: unknown;
  after?: unknown;
  /** Override the actor — defaults to the currently signed-in user. */
  actorId?: ID;
  /** Override the store — defaults to the seed store id (single-store MVP). */
  storeId?: ID;
}

/** Default store id for the MVP — single-store. Replaced in PRD-007. */
const DEFAULT_STORE_ID = "store-matriz";

/** Used when no user is authenticated (anonymous events shouldn't normally log). */
const SYSTEM_ACTOR_ID = "system";

/**
 * Fire-and-forget audit log entry.
 *
 * Never throws — failure to write a log must never break the user action.
 * Designed to be called from:
 *  - mock provider implementations (after a successful mutation)
 *  - auth flows (sign-in / sign-out)
 *  - any business component that performs a sensitive action
 *
 * ⚠️ Always pass a `resourceId`. For events not tied to a resource (sign-in),
 * use the actor id as resource id.
 */
export function auditLog(params: IAuditLogParams): void {
  const user = readCurrentUserSync();
  const actorId = params.actorId ?? user?.id ?? SYSTEM_ACTOR_ID;
  void recordAuditLog({
    actorId,
    action: params.action,
    resource: params.resource,
    resourceId: params.resourceId,
    storeId: params.storeId ?? DEFAULT_STORE_ID,
    before: params.before,
    after: params.after,
  });
}
