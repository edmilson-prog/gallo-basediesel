import type { ID } from "@/shared/types";
import { readCurrentUserSync } from "@/features/auth/guards";
import { recordAuditLog } from "../../auditLogger";

const DEFAULT_STORE_ID = "store-matriz";
const SYSTEM_ACTOR_ID = "system";

/**
 * Internal helper for mock provider implementations to record an audit log
 * after a successful mutation. Pulls the actor from `localStorage` (mirroring
 * `AuthProvider`'s hydration source) and dispatches fire-and-forget.
 *
 * Failures are swallowed inside `recordAuditLog`. Never throws.
 */
export function logMockMutation(args: {
  action: "create" | "update" | "delete" | "approve";
  resource: string;
  resourceId: ID;
  before?: unknown;
  after?: unknown;
  storeId?: ID;
}): void {
  const user = readCurrentUserSync();
  void recordAuditLog({
    actorId: user?.id ?? SYSTEM_ACTOR_ID,
    action: args.action,
    resource: args.resource,
    resourceId: args.resourceId,
    storeId: args.storeId ?? DEFAULT_STORE_ID,
    before: args.before,
    after: args.after,
  });
}
