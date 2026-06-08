import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getActiveDataSource, type DataSource } from "@/providers/data";

export interface IDataHealth {
  /** Number of currently-observed queries sitting in an error state. */
  failingCount: number;
  /** True when at least one query a mounted screen depends on failed to load. */
  isFailing: boolean;
  /** Active data origin (`mock` or `supabase`), for labelling the break. */
  source: DataSource;
  /** Refetch every errored query (the banner's "try again" action). */
  retry: () => void;
}

/**
 * Observes the TanStack Query cache and reports whether the active data origin
 * (mock or Supabase) is currently failing to serve data to a screen the user is
 * looking at. Only counts queries with active observers so background/stale
 * errors don't trigger a false alarm. Drives {@link DataSourceBanner}.
 */
export function useDataHealth(): IDataHealth {
  const queryClient = useQueryClient();
  const [failingCount, setFailingCount] = useState(0);

  useEffect(() => {
    const cache = queryClient.getQueryCache();
    const recompute = () => {
      const count = cache
        .getAll()
        .filter((query) => query.state.status === "error" && query.getObserversCount() > 0).length;
      setFailingCount(count);
    };
    recompute();
    return cache.subscribe(recompute);
  }, [queryClient]);

  const retry = useCallback(() => {
    void queryClient.refetchQueries({ predicate: (query) => query.state.status === "error" });
  }, [queryClient]);

  return {
    failingCount,
    isFailing: failingCount > 0,
    source: getActiveDataSource(),
    retry,
  };
}
