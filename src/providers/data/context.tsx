import { createContext, useMemo, type ReactNode } from "react";
import type { IDataProviders } from "./contracts";
import { getDataProviders } from "./factory";

export const DataProviderContext = createContext<IDataProviders | null>(null);

interface IDataProvidersProviderProps {
  children: ReactNode;
  /**
   * Override the providers injected into the tree — useful for stories, unit
   * tests or environments where a custom mix is required. Omit in app code so
   * the factory selects the implementation from `VITE_DATA_SOURCE`.
   */
  providers?: IDataProviders;
}

/**
 * Provides the configured data providers to every descendant. Should be
 * mounted exactly once near the application root, between `<ThemeProvider>`
 * and `<AuthProvider>` so that any auth helper relying on data is covered.
 */
export function DataProvidersProvider({
  children,
  providers,
}: IDataProvidersProviderProps): JSX.Element {
  const value = useMemo(() => providers ?? getDataProviders(), [providers]);
  return <DataProviderContext.Provider value={value}>{children}</DataProviderContext.Provider>;
}
