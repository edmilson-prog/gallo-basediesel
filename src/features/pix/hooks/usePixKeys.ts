import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IPixKey } from "@/shared/types";
import { usePixKeyProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";

export interface IUsePixKeys {
  keys: IPixKey[];
  activeKeys: IPixKey[];
  isLoading: boolean;
  isError: boolean;
  findByShortcut: (shortcut: string) => IPixKey | null;
}

/**
 * Read hook for the store's PIX keys. Shared by the settings screen and (from
 * Task 9 on) the composer shortcut, which is why `findByShortcut` looks only at
 * ACTIVE keys: deactivating a key must stop it from being sent, not merely hide
 * it from the list.
 */
export function usePixKeys(): IUsePixKeys {
  const provider = usePixKeyProvider();
  const { currentStoreId, isHydrating } = useCurrentStore();

  const query = useQuery({
    queryKey: ["pix", "keys", currentStoreId],
    // `storeId` is passed EXPLICITLY. The mock provider forwards list params
    // straight to `pixKeyApi.list` without `scopedListParams`, so an unscoped
    // `list({})` would return every store's keys — the query key would say one
    // store while the data held all of them. Supabase is covered by RLS either
    // way; passing it keeps both backends telling the same truth.
    queryFn: () => provider.list({ storeId: currentStoreId ?? undefined }),
    enabled: Boolean(currentStoreId),
  });

  // Stabilize identity so the `?? []` fallback doesn't produce a fresh array
  // every render (keeps react-hooks/exhaustive-deps quiet on findByShortcut).
  const keys = useMemo(() => query.data ?? [], [query.data]);

  // Sorted so the default key is always first — it is the one most sends use.
  const activeKeys = useMemo(
    () =>
      keys
        .filter((k) => k.isActive)
        .sort(
          (a, b) =>
            Number(b.isDefault) - Number(a.isDefault) || a.alias.localeCompare(b.alias, "pt-BR"),
        ),
    [keys],
  );

  const findByShortcut = useCallback(
    (shortcut: string) =>
      activeKeys.find((k) => k.shortcut?.toLowerCase() === shortcut.toLowerCase()) ?? null,
    [activeKeys],
  );

  return {
    keys,
    activeKeys,
    // `enabled: false` leaves `query.isLoading` false while the multi-store
    // provider is still resolving the active store, which would flash the empty
    // state before the first fetch ever starts. Fold hydration into the flag.
    isLoading: isHydrating || query.isLoading,
    isError: query.isError,
    findByShortcut,
  };
}
