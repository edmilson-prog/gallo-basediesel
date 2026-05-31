import type { ID, NotificationRecipientType } from "@/shared/types";
import { getCurrentContext } from "@/features/multistore/utils/getCurrentContext";
import { readCustomerSessionSync } from "@/features/storefront-account/store/customerAuthStore";
import type { IListNotificationsParams } from "../../contracts/notifications";

/**
 * Notification recipient scope resolved from the authenticated actor.
 *
 * Maps the RBAC multi-store model onto the notification layer:
 *   - Owner  → `storeScope:"all"` — can see every notification, any recipient, any store
 *   - Gestor → `storeScope:"store"` — can see all notifications for their active store
 *   - Vendedor / SDR / VendedorExterno / Financeiro → `storeScope:"own"` — their own recipientId
 *   - Cliente → `storeScope:"own"` — their own recipientId (external customer session)
 *
 * `recipientType` derives from whether the authenticated user holds a "Cliente"
 * role (customer session) or any seller-side role. The mock bootstrap only
 * generates seller users, so in Fase 1 "Customer" recipients arrive from seed
 * data, not live auth sessions; the scope still models it correctly for when
 * the portal PRD adds a real customer login.
 *
 * Gestor note: the `notificationsApi` does not accept a `storeId` filter param.
 * The Gestor store restriction is enforced as a post-fetch filter inside the
 * `mockNotificationStore` implementation. `enforceListScope` marks the scope
 * so the implementation knows to apply it.
 *
 * @see docs/multistore.md (multi-store scope reference)
 * @see src/providers/data/impl/mock/_storeScope.ts (mirror pattern)
 */
export interface IRecipientScope {
  /** The resolved recipientId that list/count/write must be filtered to. */
  recipientId: ID | null;
  /** Derived recipient type from the session actor. */
  recipientType: NotificationRecipientType | null;
  /** How broad the recipient scope is for this role. */
  storeScope: "own" | "store" | "all";
  /**
   * For `storeScope:"store"` (Gestor): the store id used in post-fetch
   * filtering. null for Owner (no restriction) or unauthenticated.
   */
  storeId: ID | null;
}

/**
 * Resolve the current recipient scope from the authenticated actor.
 *
 * Never throws — returns `storeScope:"own"` with `recipientId:null` when the
 * session is empty, which will produce an empty result set in list queries
 * (safer than accidentally exposing data).
 */
export function resolveRecipientScope(): IRecipientScope {
  // Customer portal: on the storefront account area with an active customer
  // session, scope notifications to that customer. App surfaces (/app/*) never
  // match this branch — they always run under a seller session.
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/loja")) {
    const customerSession = readCustomerSessionSync();
    if (customerSession) {
      const { currentStoreId } = getCurrentContext();
      return {
        recipientId: customerSession.customerId,
        recipientType: "customer",
        storeScope: "own",
        storeId: currentStoreId,
      };
    }
  }

  const { user, currentStoreId } = getCurrentContext();

  if (!user) {
    return {
      recipientId: null,
      recipientType: null,
      storeScope: "own",
      storeId: null,
    };
  }

  const role = user.role;

  if (role === "Owner") {
    return {
      recipientId: user.id,
      recipientType: "seller",
      storeScope: "all",
      storeId: null, // no store restriction
    };
  }

  if (role === "Gestor") {
    return {
      recipientId: user.id,
      recipientType: "seller",
      storeScope: "store",
      storeId: currentStoreId,
    };
  }

  if (role === "Cliente") {
    return {
      recipientId: user.id,
      recipientType: "customer",
      storeScope: "own",
      storeId: currentStoreId,
    };
  }

  // Vendedor, SDR, VendedorExterno, Financeiro — own seller scope
  return {
    recipientId: user.id,
    recipientType: "seller",
    storeScope: "own",
    storeId: currentStoreId,
  };
}

/**
 * Override any client-supplied `recipientId` in list params with the values
 * enforced by the current actor's RBAC scope.
 *
 * Rules:
 *   - Owner: no override — query as-is (may list any recipient)
 *   - Gestor: pass params through; the implementation must apply a post-fetch
 *     `storeId` filter using `ctx.storeId` (the API param layer has no storeId)
 *   - Vendedor / Cliente (storeScope:"own"): force `recipientId` to the actor's
 *     own id; discard any client-supplied `recipientId` — scope is non-bypassable
 *
 * @param params - Raw client-supplied query params (may be undefined)
 * @param ctx    - Pre-resolved scope (pass `resolveRecipientScope()` result)
 * @returns Enforced params safe to forward to the mock API
 */
export function enforceListScope(
  params: IListNotificationsParams | undefined,
  ctx: IRecipientScope,
): IListNotificationsParams {
  const base: IListNotificationsParams = { ...(params ?? {}) };

  switch (ctx.storeScope) {
    case "all":
      // Owner — pass params through unmodified; they may list any recipient
      return base;

    case "store":
      // Gestor — params pass through; post-fetch store filter applied in impl
      // (notificationsApi does not accept storeId in its param interface)
      return base;

    case "own":
    default:
      // Vendedor / Cliente — non-bypassable: override with actor's own id
      return {
        ...base,
        recipientId: ctx.recipientId ?? undefined,
      };
  }
}
