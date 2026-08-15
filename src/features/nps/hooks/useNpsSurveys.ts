import { useQuery } from "@tanstack/react-query";
import { useNpsProvider } from "@/providers/data";
import type { INpsListFilters } from "@/shared/types";

/**
 * Paginated list of answered surveys.
 *
 * Returns the provider's `total` alongside the page so the caller can page
 * honestly: a full page is not the end of the list, and inferring the end from
 * a short page is the truncation bug this codebase has already paid for once.
 */
export function useNpsSurveys(filters: INpsListFilters) {
  const provider = useNpsProvider();

  return useQuery({
    queryKey: [
      "nps",
      "surveys",
      filters.storeId ?? "all",
      filters.windowDays,
      filters.trigger ?? "any",
      filters.audience ?? "any",
      filters.npsClass ?? "any",
      filters.search ?? "",
      // Every filter that reaches the server belongs in the key. One left out
      // means the cache answers a different question than the one asked.
      filters.hasComment ? "commented" : "any",
      filters.reason ?? "any",
      filters.page ?? 1,
      filters.pageSize ?? 30,
    ],
    queryFn: () => provider.list(filters),
  });
}
