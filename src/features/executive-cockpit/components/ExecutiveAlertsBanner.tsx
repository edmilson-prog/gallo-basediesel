import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { ICockpitAlert } from "../hooks/useCockpitAlerts";
import { EXECUTIVE_COCKPIT_STRINGS as S } from "../i18n/pt-BR";

export interface IExecutiveAlertsBannerProps {
  alerts: ICockpitAlert[];
  onDismiss: (hash: string) => void;
  onView?: (alert: ICockpitAlert) => void;
}

const SEVERITY_CLASS: Record<ICockpitAlert["severity"], string> = {
  info: "border-sky-500/50 bg-sky-50 text-sky-900 dark:bg-sky-500/10 dark:text-sky-100",
  warning:
    "border-amber-500/60 bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100",
  danger: "border-red-500/60 bg-red-50 text-red-900 dark:bg-red-500/10 dark:text-red-100",
};

const SEVERITY_ICON: Record<ICockpitAlert["severity"], string> = {
  info: "mdi:information-outline",
  warning: "mdi:alert-outline",
  danger: "mdi:alert-octagon-outline",
};

export function ExecutiveAlertsBanner({ alerts, onDismiss, onView }: IExecutiveAlertsBannerProps) {
  if (alerts.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label={S.sectionAlerts}>
      {alerts.map((alert) => (
        <div
          key={alert.hash}
          role="alert"
          className={cn(
            "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
            SEVERITY_CLASS[alert.severity],
          )}
        >
          <Icon icon={SEVERITY_ICON[alert.severity]} size={20} className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">{alert.title}</p>
            <p className="text-xs opacity-90">{alert.description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {alert.drillLabel && onView && (
              <button
                type="button"
                onClick={() => onView(alert)}
                className="rounded-md px-2 py-1 text-xs font-medium underline-offset-2 hover:bg-background/30 hover:underline"
              >
                {alert.drillLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => onDismiss(alert.hash)}
              aria-label={S.alertDismiss}
              className="rounded-md p-1 hover:bg-background/30"
            >
              <Icon icon="mdi:close" size={16} />
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
