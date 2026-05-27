import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ID } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { useInsightsDailyDetection } from "../hooks/useInsightsDailyDetection";
import { INSIGHTS_STRINGS as S } from "../i18n/pt-BR";

export interface ICriticalInsightsWidgetProps {
  storeId: ID;
  accessibleStoreIds?: ID[];
  /** Maximum number of critical insights to display (default 5). */
  limit?: number;
}

/**
 * Compact widget that surfaces the top critical insights at the top of the
 * Manager Dashboard (PRD-014). Clicking on the card or on "Ver todos" navigates
 * to `/app/insights` so the gestor can drill into the full list.
 */
export function CriticalInsightsWidget({
  storeId,
  accessibleStoreIds,
  limit = 5,
}: ICriticalInsightsWidgetProps) {
  const navigate = useNavigate();
  const result = useInsightsDailyDetection(storeId, accessibleStoreIds ?? [storeId]);

  const critical = useMemo(
    () => result.active.filter((i) => i.priority === "critico").slice(0, limit),
    [result.active, limit],
  );

  return (
    <Card className="p-4">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:alert-octagon" size={18} className="text-destructive" />
          <h3 className="text-sm font-semibold text-foreground">{S.widgetTitle}</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => void navigate({ to: "/app/insights" })}
        >
          {S.widgetSeeAll}
          <Icon icon="mdi:arrow-right" size={14} className="ml-1" />
        </Button>
      </header>

      {result.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : critical.length === 0 ? (
        <p className="rounded-sm border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {S.widgetEmpty}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {critical.map((insight) => (
            <li key={insight.id}>
              <button
                type="button"
                onClick={() => void navigate({ to: "/app/insights" })}
                className="flex w-full items-start gap-2 rounded-sm border border-destructive/20 bg-destructive/5 px-3 py-2 text-left text-xs transition-colors hover:bg-destructive/10"
              >
                <Icon
                  icon="mdi:alert"
                  size={14}
                  className="mt-0.5 shrink-0 text-destructive"
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    {insight.title}
                  </span>
                  <span className="block truncate text-muted-foreground">
                    {insight.description}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
