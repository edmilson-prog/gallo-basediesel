import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ID } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useInsightsDailyDetection } from "../hooks/useInsightsDailyDetection";
import { INSIGHTS_STRINGS as S } from "../i18n/pt-BR";

export interface IInsightsBannerProps {
  storeId: ID;
  accessibleStoreIds?: ID[];
}

/**
 * Top banner used by the Executive Cockpit (PRD-040) when at least one
 * critical insight is active. Clicking the CTA jumps to `/app/insights`.
 *
 * The banner renders nothing when no critical insights exist or while the
 * engine is still computing.
 */
export function InsightsBanner({ storeId, accessibleStoreIds }: IInsightsBannerProps) {
  const navigate = useNavigate();
  const result = useInsightsDailyDetection(storeId, accessibleStoreIds ?? [storeId]);

  const count = useMemo(
    () => result.active.filter((i) => i.priority === "critico").length,
    [result.active],
  );

  if (result.isLoading || count === 0) return null;

  const message = count === 1 ? S.bannerCriticalSingular : S.bannerCriticalPlural(count);

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-destructive/20 text-destructive">
          <Icon icon="mdi:brain" size={18} />
        </span>
        <p className="text-sm font-medium text-foreground">{message}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="self-start border-destructive/40 text-destructive hover:bg-destructive/15 sm:self-auto"
        onClick={() => void navigate({ to: "/app/insights" })}
      >
        {S.bannerCta}
        <Icon icon="mdi:arrow-right" size={14} className="ml-1" />
      </Button>
    </div>
  );
}
