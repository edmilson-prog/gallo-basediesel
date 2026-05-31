import type { INotificationStores } from "./contracts";

/**
 * Placeholder reconciler — real logic is implemented in Task 5.2.
 *
 * The reconciler will subscribe to a polling interval (driven by
 * `IManagerDashboardSettings.alertPollingSeconds`), read the current derived
 * conditions via the shared `build*` functions from `conditions/derivedConditions.ts`,
 * map each `IActiveAlert` to a derived `INotification`, and call
 * `stores.notifications.reconcileDerived` to upsert new conditions and expire
 * stale ones.
 *
 * @see Task 5.2 for the real implementation.
 * @stub
 */
export function startReconciler(_stores: INotificationStores): () => void {
  // TODO(Task 5.2): implement derived-condition reconciler loop.
  return () => {};
}
