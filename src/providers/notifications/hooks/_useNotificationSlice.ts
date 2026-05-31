import { useContext } from "react";
import { NotificationProviderContext } from "../context";
import type { INotificationStores } from "../contracts";

/**
 * Internal helper for the per-aggregate notification hooks. Looks up the
 * notification provider context, throws a clear error when used outside
 * `<NotificationProvidersProvider>`, and returns the requested slice.
 */
export function useNotificationSlice<K extends keyof INotificationStores>(
  key: K,
  hookName: string,
): INotificationStores[K] {
  const value = useContext(NotificationProviderContext);
  if (value === null) {
    throw new Error(`${hookName} deve ser usado dentro de <NotificationProvidersProvider>`);
  }
  return value[key];
}
