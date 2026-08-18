import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { useSettingsProvider } from "@/providers/data";
import type { IInboundToastSettings } from "@/shared/types";
import { resolveInboundToastSettings } from "../engine/resolveInboundToastSettings";

const DEFAULT_STORE_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Per-store on-screen alert config (Configurações → Sons de notificação).
 *
 * Reads the SAME `["settings", storeId]` query as `useSoundEventPlayer`, so the
 * two share one cache entry and this hook costs no extra round-trip. Always
 * returns a usable object — an absent or corrupt blob resolves to the defaults.
 */
export function useInboundToastSettings(): IInboundToastSettings {
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? DEFAULT_STORE_ID;
  const settingsProvider = useSettingsProvider();

  const settingsQuery = useQuery({
    queryKey: ["settings", storeId],
    queryFn: () => settingsProvider.get(storeId),
    enabled: Boolean(currentUser),
    staleTime: 5 * 60_000,
  });

  return resolveInboundToastSettings(settingsQuery.data?.inboundToast);
}
