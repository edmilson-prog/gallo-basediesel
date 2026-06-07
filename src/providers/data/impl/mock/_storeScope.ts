import type { ID } from "@/shared/types";
import type { ResourceName } from "@/features/rbac/permissions/resources";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { getCurrentContext } from "@/features/multistore/utils/getCurrentContext";
import { withStoreScope } from "@/features/multistore/utils/withStoreScope";
import { MockValidationError } from "@/mocks";

/**
 * Resolve the active context and apply `withStoreScope` to the params of a
 * list query. Co-located with the mock implementations so consumers stay
 * agnostic of the multi-store layer.
 *
 * @see docs/multistore.md
 */
export function scopedListParams<T extends Record<string, unknown>>(
  params: T | undefined,
  resource: ResourceName,
): T & { storeId?: ID } {
  const ctx = getCurrentContext();
  return withStoreScope((params ?? {}) as T, {
    user: ctx.user,
    currentStoreId: ctx.currentStoreId,
    resource,
  });
}

/**
 * Narrow a list query to records "owned" by the current user when their RBAC
 * scope on the resource is exactly `own` — i.e. they cannot view the wider
 * `team` / `store` / `all` set.
 *
 * Pattern: `assignedSellerId` (or any caller-chosen field) gets filled with
 * the user's id so the mock layer returns only their own slice. Callers
 * always win — if the field is already set in `params`, the override is
 * preserved (used by Gestor passing a specific seller filter).
 *
 * Used by resources that combine a store-wide query with an implicit
 * ownership boundary (conversations, leads, customers when consulted by a
 * Vendedor).
 *
 * @see docs/multistore.md#own-scope
 */
export function withOwnSellerScope<T extends Record<string, unknown>>(
  params: T,
  resource: ResourceName,
  field: keyof T = "assignedSellerId" as keyof T,
): T {
  const { user } = getCurrentContext();
  if (!user) return params;
  if (hasPermission(user, resource, "view", "store")) return params;
  if (!hasPermission(user, resource, "view", "own")) return params;
  if (params[field] !== undefined) return params;
  return { ...params, [field]: user.id } as T;
}

/**
 * Pre-fill `storeId` on create inputs with the active store when the caller
 * omits it.
 *
 * Keeps feature code thin: callers don't need to remember to thread `storeId`
 * through every mutation. When `storeId` is already present, it wins — the
 * helper never overrides explicit intent (used by, e.g., Owner creating data
 * directly in another store via a future cross-store form).
 *
 * Falls back to a sentinel id when no current store is resolved so the
 * underlying validation surfaces a clean error instead of an obscure crash.
 */
export function withCreateStoreId<T extends { storeId?: ID }>(input: T): T & { storeId: ID } {
  if (input.storeId) return input as T & { storeId: ID };
  const { currentStoreId } = getCurrentContext();
  if (!currentStoreId) {
    throw new MockValidationError("Não é possível criar o registro sem uma loja ativa.", "storeId");
  }
  return { ...input, storeId: currentStoreId };
}

/**
 * Block `storeId` changes on update mutations.
 *
 * On the MVP, `storeId` is immutable after creation — moving a record between
 * stores requires the explicit transfer flow planned for Fase 2 (with its own
 * audit trail and possibly an approval step). Surfaces a `MockValidationError`
 * so the UI can present the constraint clearly.
 */
export function assertImmutableStoreId<T extends { storeId?: ID }>(
  current: { storeId?: ID } | null | undefined,
  patch: T,
): void {
  if (!current) return;
  if (patch.storeId === undefined) return;
  if (patch.storeId === current.storeId) return;
  throw new MockValidationError(
    "O campo storeId é imutável no MVP — use o fluxo de transferência entre lojas (Fase 2).",
    "storeId",
  );
}
