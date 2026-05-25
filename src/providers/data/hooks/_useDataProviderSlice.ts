import { useContext } from "react";
import { DataProviderContext } from "../context";
import type { IDataProviders } from "../contracts";

/**
 * Internal helper for the per-aggregate hooks. Looks up the data provider
 * context, throws a clear error when used outside `<DataProvidersProvider>`,
 * and returns the requested slice.
 */
export function useDataProviderSlice<K extends keyof IDataProviders>(
  key: K,
  hookName: string,
): IDataProviders[K] {
  const value = useContext(DataProviderContext);
  if (value === null) {
    throw new Error(`${hookName} deve ser usado dentro de <DataProvidersProvider>`);
  }
  return value[key];
}
