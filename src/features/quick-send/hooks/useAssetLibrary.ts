import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ID, IAssetLibraryItem } from "@/shared/types";
import { useAssetLibraryProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import type { IAssetFilter } from "../engine/assetFiltering";

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
  const sellerId = currentUser?.sellerId ?? "anon";
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
      // sellers.id). A logged-in user with no linked seller has sellerId === "anon",
      // which would violate the FK — skip the write instead of throwing an unhandled
      // rejection (mirrors the useSendAsset → recordSend guard).
      if (!currentUser?.sellerId) return;
      void provider.toggleFavorite(sellerId, id).then(() => {
        void queryClient.invalidateQueries({ queryKey: ["quick-send", "favorites", sellerId] });
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
