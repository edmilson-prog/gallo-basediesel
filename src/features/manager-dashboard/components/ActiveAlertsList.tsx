import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { InfoHint } from "@/components/InfoHint";
import { MANAGER_DASHBOARD_STRINGS } from "../i18n/pt-BR";
import {
  useNotifications,
  useNotificationMutations,
  type NotificationSeverity,
} from "@/providers/notifications";

type BadgeTier = "critical" | "high" | "medium";

function tierOf(sev: NotificationSeverity): BadgeTier {
  if (sev === "critical") return "critical";
  if (sev === "warning") return "high";
  return "medium"; // info, success
}

const SEVERITY_LABEL: Record<BadgeTier, string> = {
  critical: MANAGER_DASHBOARD_STRINGS.alertSeverityCritical,
  high: MANAGER_DASHBOARD_STRINGS.alertSeverityHigh,
  medium: MANAGER_DASHBOARD_STRINGS.alertSeverityMedium,
};

const SEVERITY_BADGE: Record<BadgeTier, string> = {
  critical: "bg-red-500/15 text-red-600 dark:text-red-400",
  high: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  medium: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};

const SEVERITY_ICON: Record<BadgeTier, string> = {
  critical: "mdi:alert-octagon-outline",
  high: "mdi:alert-outline",
  medium: "mdi:information-outline",
};

const MAX_VISIBLE = 6;

/**
 * Self-contained widget that reads lifecycle:"derived" notifications from the
 * PRD-008 Notification Center (the reconciler projects the same 3 dashboard
 * alert conditions into the store). "Ver" navigates to the Notification Center;
 * "Dispensar" archives via useNotificationMutations.
 */
export function ActiveAlertsList() {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const { data, isLoading } = useNotifications({ statuses: ["unread", "read"], pageSize: 100 });
  const { archive } = useNotificationMutations();

  const alerts = data.filter((n) => n.lifecycle === "derived");
  const visible = expanded ? alerts : alerts.slice(0, MAX_VISIBLE);
  const hiddenCount = alerts.length - visible.length;

  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="flex items-center gap-1.5 text-base font-semibold tracking-tight text-foreground">
            {MANAGER_DASHBOARD_STRINGS.alertsTitle}
            {alerts.length > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {alerts.length}
              </span>
            )}
            <InfoHint
              text={MANAGER_DASHBOARD_STRINGS.alertsHelp}
              label={MANAGER_DASHBOARD_STRINGS.alertsTitle}
            />
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
          {visible.map((alert) => {
            const tier = tierOf(alert.severity);
            return (
              <li
                key={alert.id}
                className="flex items-start gap-3 rounded-md border bg-card/50 p-3"
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                    SEVERITY_BADGE[tier],
                  )}
                  aria-label={SEVERITY_LABEL[tier]}
                >
                  <Icon icon={SEVERITY_ICON[tier]} size={16} />
                </span>
                <div className="flex flex-1 flex-col gap-1.5 min-w-0">
                  <p className="text-sm leading-snug text-foreground">{alert.title}</p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void navigate({ to: "/app/notificacoes" })}
                      className="h-7 px-2 text-xs"
                    >
                      {MANAGER_DASHBOARD_STRINGS.alertsView}
                      <Icon icon="mdi:arrow-right" size={12} className="ml-1" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void archive(alert.id)}
                      className="h-7 px-2 text-xs text-muted-foreground"
                    >
                      {MANAGER_DASHBOARD_STRINGS.alertsDismiss}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
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
