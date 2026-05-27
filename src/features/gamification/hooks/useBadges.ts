import { useQuery } from "@tanstack/react-query";
import type { IGamificationBadge, ID } from "@/shared/types";
import { badgesApi } from "@/mocks/api";

const STALE_MS = 30_000;

interface IUseBadgesParams {
  /** Restrict to a specific seller (drill-down). */
  sellerId?: ID;
  /** Restrict to a specific period reference (e.g. "2026-05"). */
  periodRef?: string;
  /** Currently unused — placeholder for multi-store filtering when scope grows. */
  storeId?: ID;
  enabled?: boolean;
}

interface IUseBadgesResult {
  isLoading: boolean;
  hasError: boolean;
  refetch: () => void;
  badges: IGamificationBadge[];
}

/**
 * Loads gamification badges from the mock badges API (PRD-043).
 *
 * No provider contract — badges are derived data, not a transactional entity,
 * so they live on the mock store directly and the hook calls `badgesApi` to
 * keep the supabase swap path clear (a future supabase impl can expose the
 * same surface via a view).
 */
export function useBadges(params: IUseBadgesParams = {}): IUseBadgesResult {
  const { sellerId, periodRef, enabled = true } = params;

  const query = useQuery({
    queryKey: ["gamification", "badges", sellerId ?? "all", periodRef ?? "all"],
    queryFn: () => badgesApi.list({ sellerId, periodRef }),
    staleTime: STALE_MS,
    enabled,
  });

  return {
    isLoading: query.isLoading,
    hasError: query.isError,
    refetch: () => {
      void query.refetch();
    },
    badges: query.data ?? [],
  };
}
