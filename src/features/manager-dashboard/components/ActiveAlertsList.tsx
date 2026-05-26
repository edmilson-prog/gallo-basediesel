import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { MANAGER_DASHBOARD_STRINGS } from "../i18n/pt-BR";
import type { AlertSeverity, IActiveAlert } from "../hooks/useActiveAlerts";

export interface IActiveAlertsListProps {
  alerts: IActiveAlert[];
  isLoading: boolean;
  onView: (alert: IActiveAlert) => void;
  onDismiss: (alert: IActiveAlert) => void;
}

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: MANAGER_DASHBOARD_STRINGS.alertSeverityCritical,
  high: MANAGER_DASHBOARD_STRINGS.alertSeverityHigh,
  medium: MANAGER_DASHBOARD_STRINGS.alertSeverityMedium,
};

const SEVERITY_BADGE: Record<AlertSeverity, string> = {
  critical: "bg-red-500/15 text-red-600 dark:text-red-400",
  high: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  medium: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

const SEVERITY_ICON: Record<AlertSeverity, string> = {
  critical: "mdi:alert-octagon-outline",
  high: "mdi:alert-outline",
  medium: "mdi:information-outline",
};

const MAX_VISIBLE = 6;

export function ActiveAlertsList({ alerts, isLoading, onView, onDismiss }: IActiveAlertsListProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? alerts : alerts.slice(0, MAX_VISIBLE);
  const hiddenCount = alerts.length - visible.length;

  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {MANAGER_DASHBOARD_STRINGS.alertsTitle}
            {alerts.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {alerts.length}
              </span>
            )}
          </h2>
          <p className="text-xs text-muted-foreground">
            {MANAGER_DASHBOARD_STRINGS.alertsSubtitle}
          </p>
        </div>
        <Icon icon="mdi:bell-ring-outline" size={20} className="text-muted-foreground" />
      </header>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Icon icon="mdi:check-circle-outline" size={22} />
          </span>
          <p className="text-sm text-muted-foreground">{MANAGER_DASHBOARD_STRINGS.alertsEmpty}</p>
        </div>
      ) : (
        <ul className="flex flex-1 flex-col gap-2">
          {visible.map((alert) => (
            <li key={alert.id} className="flex items-start gap-3 rounded-md border bg-card/50 p-3">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                  SEVERITY_BADGE[alert.severity],
                )}
                aria-label={SEVERITY_LABEL[alert.severity]}
              >
                <Icon icon={SEVERITY_ICON[alert.severity]} size={16} />
              </span>
              <div className="flex flex-1 flex-col gap-1.5 min-w-0">
                <p className="text-sm leading-snug text-foreground">{alert.message}</p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onView(alert)}
                    className="h-7 px-2 text-xs"
                  >
                    {MANAGER_DASHBOARD_STRINGS.alertsView}
                    <Icon icon="mdi:arrow-right" size={12} className="ml-1" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onDismiss(alert)}
                    className="h-7 px-2 text-xs text-muted-foreground"
                  >
                    {MANAGER_DASHBOARD_STRINGS.alertsDismiss}
                  </Button>
                </div>
              </div>
            </li>
          ))}
          {hiddenCount > 0 && (
            <li className="mt-auto">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(true)}
                className="h-8 w-full text-xs"
              >
                {MANAGER_DASHBOARD_STRINGS.alertsViewMore(hiddenCount)}
              </Button>
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}
