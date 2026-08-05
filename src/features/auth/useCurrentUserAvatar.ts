import { useQuery } from "@tanstack/react-query";
import { useSellersProvider } from "@/providers/data";
import { useAuth } from "./useAuth";

/**
 * Query key of the signed-in user's profile photo.
 *
 * Exported so the profile page can invalidate it right after an upload or a
 * removal — otherwise the top-bar avatar would keep the old photo until the
 * cache went stale.
 */
export const CURRENT_USER_AVATAR_KEY = "current-user-avatar";

/**
 * Photo of the signed-in user, or null when there is none.
 *
 * The auth profile (`profiles`) carries no photo — it lives on the seller row,
 * so this reads it separately and caches it for the whole session. Users with
 * no linked seller (customers, mock profiles without `sellerId`) simply get
 * null and keep the initials fallback.
 */
export function useCurrentUserAvatar(): string | null {
  const { currentUser } = useAuth();
  const sellersProvider = useSellersProvider();
  const sellerId = currentUser?.sellerId ?? null;

  const { data } = useQuery({
    queryKey: [CURRENT_USER_AVATAR_KEY, sellerId],
    queryFn: async () => {
      if (!sellerId) return null;
      const seller = await sellersProvider.get(sellerId);
      return seller.avatarUrl ?? null;
    },
    enabled: sellerId !== null,
    staleTime: 5 * 60 * 1000,
  });

  return data ?? null;
}
