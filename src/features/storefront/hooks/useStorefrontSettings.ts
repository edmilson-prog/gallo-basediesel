import { useQuery } from "@tanstack/react-query";
import type { IStorefrontConfig } from "@/shared/types";
import { DEFAULT_STOREFRONT_CONFIG } from "@/shared/types";
import { useStorefrontProvider } from "@/providers/data";

const STOREFRONT_STORE_ID = "00000000-0000-0000-0000-000000000001";
const STALE_MS = 5 * 60 * 1000;

export interface IUseStorefrontSettingsResult {
  config: IStorefrontConfig;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Read-only access to `IPlatformSettings.storefront` of the headquarters
 * store. The storefront is single-store on the MVP — multi-store support
 * (per-domain settings) is a Fase 2 concern.
 */
export function useStorefrontSettings(): IUseStorefrontSettingsResult {
  const storefrontProvider = useStorefrontProvider();
  const query = useQuery({
    queryKey: ["storefront", "settings", STOREFRONT_STORE_ID] as const,
    queryFn: () => storefrontProvider.getConfig(STOREFRONT_STORE_ID),
    staleTime: STALE_MS,
  });

  return {
    config: query.data ?? DEFAULT_STOREFRONT_CONFIG,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
