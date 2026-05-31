import { createContext, useMemo, useEffect, type ReactNode } from "react";
import type { INotificationStores } from "./contracts";
import { getNotificationStores } from "./factory";
import { startReconciler } from "./reconciler";

export const NotificationProviderContext = createContext<INotificationStores | null>(null);

interface INotificationProvidersProviderProps {
  children: ReactNode;
  /**
   * Override the stores injected into the tree — useful for stories or
   * environments where a custom mix is required. Omit in app code so the
   * factory selects the implementation from `VITE_DATA_SOURCE`.
   */
  stores?: INotificationStores;
}

/**
 * Provides the configured notification stores to every descendant. Should be
 * mounted immediately after `<DataProvidersProvider>` (wrapping `<AuthProvider>`)
 * so that any auth helper relying on notification data is covered.
 *
 * Also boots the reconciler via a side-effect so derived conditions are kept
 * in sync from the moment the provider is mounted.
 *
 * Router wiring (`startRouter`) is added in Task 3.5 — not wired here yet.
 */
export function NotificationProvidersProvider({
  children,
  stores,
}: INotificationProvidersProviderProps): JSX.Element {
  const value = useMemo(() => stores ?? getNotificationStores(), [stores]);

  useEffect(() => {
    const stopReconciler = startReconciler(value);
    return () => {
      stopReconciler();
    };
  }, [value]);

  return (
    <NotificationProviderContext.Provider value={value}>
      {children}
    </NotificationProviderContext.Provider>
  );
}
