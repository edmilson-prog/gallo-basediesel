import { createContext, useMemo, useEffect, type ReactNode } from "react";
import {
  useManagerDashboardProvider,
  useSettingsProvider,
  useStoresProvider,
} from "@/providers/data";
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
 * Provides the configured notification stores to every descendant. Mounted
 * immediately inside `<DataProvidersProvider>` (wrapping `<AuthProvider>`) so it
 * can read the data providers the reconciler needs.
 *
 * Boots two side-effects tied to the stores' lifetime:
 *  - the event router (`startRouter`), which fans domain events out into
 *    notifications across channels;
 *  - the reconciler (`startReconciler`), which projects the shared derived
 *    conditions (PRD-014) into derived notifications and expires stale ones.
 */
export function NotificationProvidersProvider({
  children,
  stores,
}: INotificationProvidersProviderProps): JSX.Element {
  const value = useMemo(() => stores ?? getNotificationStores(), [stores]);

  const managerDashboardProvider = useManagerDashboardProvider();
  const settingsProvider = useSettingsProvider();
  const storesProvider = useStoresProvider();

  useEffect(() => {
    const stopRouter = startRouter(value);
    const stopReconciler = startReconciler(value, {
      stores: storesProvider,
      settings: settingsProvider,
      managerDashboard: managerDashboardProvider,
    });
    return () => {
      stopRouter();
      stopReconciler();
    };
  }, [value, storesProvider, settingsProvider, managerDashboardProvider]);

  return (
    <NotificationProviderContext.Provider value={value}>
      {children}
    </NotificationProviderContext.Provider>
  );
}
