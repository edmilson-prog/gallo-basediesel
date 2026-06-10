import { useQuery } from "@tanstack/react-query";
import { useSystemHealthProvider } from "@/providers/data";

/** Healthcheck refresh cadence on the dashboard (PRD-110, RF-034). */
const HEALTHCHECK_REFETCH_MS = 30_000;

/**
 * Data plumbing for the system health dashboard (PRD-110).
 *
 * The healthcheck repolls every 30s while the page is open; the cron roster
 * and DB stats are near-static and refresh on a slower cadence.
 */
export function useSystemHealth() {
  const provider = useSystemHealthProvider();

  const healthcheck = useQuery({
    queryKey: ["system-health", "healthcheck"],
    queryFn: () => provider.getHealthcheck(),
    refetchInterval: HEALTHCHECK_REFETCH_MS,
  });

  const cronJobs = useQuery({
    queryKey: ["system-health", "cron-jobs"],
    queryFn: () => provider.listCronJobs(),
    staleTime: 60_000,
  });

  const dbStats = useQuery({
    queryKey: ["system-health", "db-stats"],
    queryFn: () => provider.getDbStats(),
    staleTime: 60_000,
  });

  return { healthcheck, cronJobs, dbStats };
}
