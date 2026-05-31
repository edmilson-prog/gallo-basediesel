import { createContext, useMemo, useEffect, type ReactNode } from "react";
import type { INotificationStores } from "./contracts";
import { getNotificationStores } from "./factory";
import { startReconciler } from "./reconciler";
import { startRouter } from "./routing/router";

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
 * Boots two side-effects tied to the stores' lifetime:
 *  - the event router (`startRouter`), which fans domain events out into
 *    notifications across channels;
 *  - the reconciler (`startReconciler`), which keeps derived conditions in sync.
 */
export function NotificationProvidersProvider({
  children,
  stores,
}: INotificationProvidersProviderProps): JSX.Element {
  const value = useMemo(() => stores ?? getNotificationStores(), [stores]);

  useEffect(() => {
    const stopRouter = startRouter(value);
    const stopReconciler = startReconciler(value);
    return () => {
      stopRouter();
      stopReconciler();
    };
  }, [value]);

  return (
    <NotificationProviderContext.Provider value={value}>
      {children}
    </NotificationProviderContext.Provider>
  );
}
