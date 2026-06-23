import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IAssetLibraryItem } from "@/shared/types";
import { useAssetLibraryProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import type { IAssetFilter } from "../engine/assetFiltering";

// Valid-uuid sentinel for a logged-in user with no linked seller. It matches no
// real seller row, so favorites/recents read empty instead of casting the literal
// "anon" to uuid (prod seller_id is uuid) and 400-ing the query.
const NO_SELLER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Foundation data hook for the asset library (PRD-027). Wraps the provider in
 * TanStack Query: lists by filter, plus the seller's recents and favorites.
 * `search` updates the debounce-friendly query in the filter; `toggleFavorite`
 * flips and invalidates the favorites query.
 */
export function useAssetLibrary(filter: IAssetFilter): {
  items: IAssetLibraryItem[];
  recents: IAssetLibraryItem[];
  favorites: IAssetLibraryItem[];
  isLoading: boolean;
  isError: boolean;
  search: (q: string) => void;
  toggleFavorite: (id: ID) => void;
  refetch: () => void;
} {
  const provider = useAssetLibraryProvider();
  const queryClient = useQueryClient();
  // Identity must be the REAL seller id (sellers.id), not the auth profile id:
  // asset_favorites / asset_send_log are keyed by seller_id (FK to sellers.id) and
  // the write side (useSendAsset → recordSend) already uses currentUser.sellerId —
  // the read must match or favorites/recents are invisible in production.
  const { currentUser } = useAuth();
  const sellerId = currentUser?.sellerId ?? NO_SELLER_ID;
  const [query, setQuery] = useState(filter.query ?? "");

  const effectiveFilter = useMemo<IAssetFilter>(
    () => ({ ...filter, query }),
    [filter, query],
  );

  const listQuery = useQuery({
    queryKey: ["quick-send", "assets", effectiveFilter],
    queryFn: () =>
      provider.list({
        category: effectiveFilter.category,
        brand: effectiveFilter.brand,
        productLine: effectiveFilter.productLine,
        status: effectiveFilter.status,
        search: effectiveFilter.query,
        pageSize: 200,
      }),
  });

  const recentsQuery = useQuery({
    queryKey: ["quick-send", "recents", sellerId],
    queryFn: () => provider.getRecent(sellerId),
  });

  const favoritesQuery = useQuery({
    queryKey: ["quick-send", "favorites", sellerId],
    queryFn: () => provider.getFavorites(sellerId),
  });

  const search = useCallback((q: string) => setQuery(q), []);

  const toggleFavorite = useCallback(
    (id: ID) => {
      // Favorites are keyed by the real seller id (asset_favorites.seller_id FK to
      // sellers.id). A logged-in user with no linked seller can't favorite — tell
      // them instead of silently no-oping (an "anon" write would violate the FK).
      if (!currentUser?.sellerId) {
        toast.error("Favoritos indisponíveis: seu usuário não tem um vendedor associado.");
        return;
      }
      void provider
        .toggleFavorite(sellerId, id)
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ["quick-send", "favorites", sellerId] });
        })
        .catch(() => {
          toast.error("Não foi possível atualizar o favorito.");
        });
    },
    [provider, queryClient, sellerId, currentUser?.sellerId],
  );

  const refetch = useCallback(() => {
    void listQuery.refetch();
    void recentsQuery.refetch();
    void favoritesQuery.refetch();
  }, [listQuery, recentsQuery, favoritesQuery]);

  return {
    items: listQuery.data?.data ?? [],
    recents: recentsQuery.data ?? [],
    favorites: favoritesQuery.data ?? [],
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    search,
    toggleFavorite,
    refetch,
  };
}
