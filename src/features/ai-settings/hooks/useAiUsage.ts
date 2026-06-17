import { useEffect, useState } from "react";
import { useAiProvider } from "@/providers/data";
import type { AiUsagePeriod, IAiUsageSummary } from "@/shared/types";

export function useAiUsage(period: AiUsagePeriod) {
  const provider = useAiProvider();
  const [summary, setSummary] = useState<IAiUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    provider
      .getUsageSummary(period)
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, period]);

  return { summary, loading };
}
