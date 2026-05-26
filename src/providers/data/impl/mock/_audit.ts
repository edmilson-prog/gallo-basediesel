import type { ID } from "@/shared/types";
import { readCurrentUserSync } from "@/features/auth/guards";
import { getCurrentContext } from "@/features/multistore/utils/getCurrentContext";
import { recordAuditLog } from "../../auditLogger";

/**
 * Fallback store id when the multi-store layer hasn't hydrated yet — matches
 * the seed matriz so MVP audit entries remain consistent.
 */
const FALLBACK_STORE_ID = "store-matriz";
const SYSTEM_ACTOR_ID = "system";

/**
 * Internal helper for mock provider implementations to record an audit log
 * after a successful mutation. Pulls the actor from `localStorage` (mirroring
 * `AuthProvider`'s hydration source) and the active store from the
 * multi-store context, dispatching fire-and-forget.
 *
 * Failures are swallowed inside `recordAuditLog`. Never throws.
 */
export function logMockMutation(args: {
  action: "create" | "update" | "delete" | "approve" | (string & {});
  resource: string;
  resourceId: ID;
  before?: unknown;
  after?: unknown;
  storeId?: ID;
}): void {
  const user = readCurrentUserSync();
  const { currentStoreId } = getCurrentContext();
  void recordAuditLog({
    actorId: user?.id ?? SYSTEM_ACTOR_ID,
    action: args.action,
    resource: args.resource,
    resourceId: args.resourceId,
    storeId: args.storeId ?? currentStoreId ?? FALLBACK_STORE_ID,
    before: args.before,
    after: args.after,
  });
}
