import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNpsProvider } from "@/providers/data";
import type { INpsFilters, INpsRecovery } from "@/shared/types";

/**
 * The detractor queue and the two moves that advance it.
 *
 * Kept apart from {@link useNpsMetrics} because it reads columns added by
 * `20260813160000_nps_recovery_and_parameters.sql`: until that migration is
 * applied this query fails and the tab says so, while every other surface of
 * the panel goes on working.
 *
 * `retry: false` is deliberate — a missing column is not a flaky network, and
 * three silent retries would only delay the message that explains it.
 */

export function useNpsRecoveries(filters: INpsFilters, threshold: 6 | 8 = 6) {
  const provider = useNpsProvider();

  return useQuery<INpsRecovery[]>({
    queryKey: [
      "nps",
      "recoveries",
      filters.storeId ?? "all",
      filters.windowDays,
      filters.audience ?? "any",
      // In the key because it changes which rows come back: without it, moving
      // the cut to 0–8 would keep serving the cached detractors-only queue.
      threshold,
    ],
    queryFn: () => provider.listRecoveries(filters, threshold),
    retry: false,
  });
}

export function useSetNpsRecovery() {
  const provider = useNpsProvider();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      surveyId,
      status,
      note,
    }: {
      surveyId: string;
      status: "em_contato" | "resolvido" | null;
      note?: string | null;
    }) => provider.setRecovery(surveyId, status, note),
    // Invalidate rather than patch the cache: the board's counts, the tab badge
    // and the panel's "sem tratativa concluída" all read the same list, and a
    // hand-written optimistic update would have to keep three of them honest.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nps", "recoveries"] }),
  });
}
