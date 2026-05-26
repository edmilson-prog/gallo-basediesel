import { useEffect, useState } from "react";
import type { ID, VehicleCadastroMode } from "@/shared/types";
import { useAuth } from "@/features/auth/useAuth";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { useSettingsProvider } from "@/providers/data/hooks/useSettingsProvider";

const DEFAULT_MODE: VehicleCadastroMode = "aprovacao_obrigatoria";

/**
 * Resolve the effective cadastro mode for the current user given a store.
 * Hierarchy: seller override > store setting > sensible default.
 */
export function useCadastroMode(storeId: ID | null | undefined): {
  mode: VehicleCadastroMode;
  isLoading: boolean;
} {
  const { currentUser } = useAuth();
  const settings = useSettingsProvider();
  const sellers = useSellersProvider();
  const [mode, setMode] = useState<VehicleCadastroMode>(DEFAULT_MODE);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      setIsLoading(true);
      let effective = DEFAULT_MODE;
      if (storeId) {
        try {
          const storeSettings = await settings.get(storeId);
          if (storeSettings) effective = storeSettings.vehicleCadastroMode;
        } catch {
          /* swallow — fall back to default */
        }
      }
      if (currentUser?.sellerId) {
        try {
          const seller = await sellers.get(currentUser.sellerId);
          if (seller?.vehicleCadastroMode) effective = seller.vehicleCadastroMode;
        } catch {
          /* swallow */
        }
      }
      if (!cancelled) {
        setMode(effective);
        setIsLoading(false);
      }
    }
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [storeId, currentUser?.sellerId, settings, sellers]);

  return { mode, isLoading };
}
