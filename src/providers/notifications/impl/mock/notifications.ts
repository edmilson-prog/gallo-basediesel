import { notificationsApi } from "@/mocks";
import type { ID, INotification } from "@/shared/types";
import { recordAuditLog } from "@/providers/data";
import { getCurrentContext } from "@/features/multistore/utils/getCurrentContext";
import { readCurrentUserSync } from "@/features/auth/guards";
import type {
  INotificationStore,
  IListNotificationsParams,
  IReconcileDerivedInput,
} from "../../contracts/notifications";
import type { IPaginatedResult } from "../../contracts/_shared";
import { resolveRecipientScope, enforceListScope } from "./_scope";

const FALLBACK_STORE_ID = "00000000-0000-0000-0000-000000000001";
const SYSTEM_ACTOR_ID = "system";

/**
 * Internal helper: records an audit log entry for notification mutations.
 * Mirrors the pattern in `src/providers/data/impl/mock/_audit.ts` but reads
 * actor/store from the current context rather than importing data internals.
 */
function logNotificationMutation(args: {
  action: "markRead" | "archive" | "reconcileDerived" | (string & {});
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
    resource: "notification",
    resourceId: args.resourceId,
    storeId: args.storeId ?? currentStoreId ?? FALLBACK_STORE_ID,
    before: args.before,
    after: args.after,
  });
}

/**
 * Mock implementation of `INotificationStore`.
 *
 * All list/count/markAllRead calls enforce the RBAC recipient scope before
 * forwarding to the underlying `notificationsApi`. Mutations (markRead,
 * archive) are audited via `recordAuditLog` from the data barrel.
 *
 * Gestor store filtering is applied as a post-fetch pass on paginated results
 * because the notificationsApi does not expose a `storeId` param.
 *
 * @see src/providers/notifications/impl/mock/_scope.ts
 * @see src/providers/data/impl/mock/customers.ts (audit delegation pattern)
 */
export const mockNotificationStore: INotificationStore = {
  async list(params?: IListNotificationsParams): Promise<IPaginatedResult<INotification>> {
    const ctx = resolveRecipientScope();
    const enforced = enforceListScope(params, ctx);
    const result = await notificationsApi.list(enforced);

    // Gestor: post-fetch filter to notifications belonging to the active store
    if (ctx.storeScope === "store" && ctx.storeId) {
      const storeId = ctx.storeId;
      const filtered = result.data.filter((n) => n.storeId === storeId || n.storeId === undefined);
      return {
        ...result,
        data: filtered,
        total: filtered.length,
      };
    }

    return result;
  },

  async get(id: ID): Promise<INotification> {
    return notificationsApi.get(id);
  },

  async create(
    input: Omit<INotification, "id" | "createdAt" | "status"> & {
      status?: INotification["status"];
    },
  ): Promise<INotification> {
    return notificationsApi.create(input);
  },

  async unreadCount(recipientId?: ID): Promise<number> {
    const ctx = resolveRecipientScope();
    // For "own" scope, ignore any client-supplied recipientId and use the actor's own
    if (ctx.storeScope === "own") {
      return notificationsApi.unreadCount(ctx.recipientId ?? recipientId);
    }
    // For "store" scope, count all unread in the store by fetching and filtering
    if (ctx.storeScope === "store" && ctx.storeId) {
      const storeId = ctx.storeId;
      const all = await notificationsApi.list({ statuses: ["unread"] });
      return all.data.filter((n) => n.storeId === storeId || n.storeId === undefined).length;
    }
    // Owner — count for given recipientId or all
    return notificationsApi.unreadCount(recipientId);
  },

  async markRead(id: ID): Promise<INotification> {
    const before = await notificationsApi.get(id).catch(() => null);
    const updated = await notificationsApi.markRead(id);
    logNotificationMutation({
      action: "markRead",
      resourceId: id,
      before,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },

  async markAllRead(recipientId?: ID): Promise<number> {
    const ctx = resolveRecipientScope();
    // Enforce scope: "own" always uses actor's id
    const resolvedId = ctx.storeScope === "own" ? (ctx.recipientId ?? recipientId) : recipientId;
    return notificationsApi.markAllRead(resolvedId ?? undefined);
  },

  async archive(id: ID): Promise<void> {
    const before = await notificationsApi.get(id).catch(() => null);
    await notificationsApi.archive(id);
    logNotificationMutation({
      action: "archive",
      resourceId: id,
      before,
      after: { ...before, status: "archived" },
      storeId: before?.storeId,
    });
  },

  async reconcileDerived(input: IReconcileDerivedInput): Promise<void> {
    const ctx = resolveRecipientScope();

    // Narrow recipientScope to what the current actor is allowed to reconcile
    let allowedScope: ID[];
    if (ctx.storeScope === "own" && ctx.recipientId) {
      // Vendedor/Cliente: can only reconcile their own id
      allowedScope = input.recipientScope.filter((id) => id === ctx.recipientId);
    } else if (ctx.storeScope === "store" && ctx.storeId) {
      // Gestor: scope passes through (the reconciler is store-aware by design)
      allowedScope = input.recipientScope;
    } else {
      // Owner: unrestricted
      allowedScope = input.recipientScope;
    }

    await notificationsApi.reconcileDerived({
      ...input,
      recipientScope: allowedScope,
    });
  },
};
