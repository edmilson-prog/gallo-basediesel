import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { ISdrAlert, SdrAlertSeverity } from "../hooks/useSdrAlerts";

const SEVERITY_CLASS: Record<SdrAlertSeverity, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/40 dark:bg-blue-500/10 dark:text-blue-100",
  warning:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-500/10 dark:text-amber-100",
  danger:
    "border-red-200 bg-red-50 text-red-900 dark:border-red-900/40 dark:bg-red-500/10 dark:text-red-100",
};

const SEVERITY_ICON: Record<SdrAlertSeverity, string> = {
  info: "mdi:information-outline",
  warning: "mdi:alert-outline",
  danger: "mdi:alert-circle-outline",
};

export interface ISdrAlertsBannerProps {
  alerts: ISdrAlert[];
}

export function SdrAlertsBanner({ alerts }: ISdrAlertsBannerProps) {
  if (alerts.length === 0) return null;
  return (
    <section className="mb-4 space-y-2" aria-label="Alertas do SDR">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          role="status"
          className={cn(
            "flex items-start gap-3 rounded-md border px-4 py-3 text-sm",
            SEVERITY_CLASS[alert.severity],
          )}
        >
          <Icon icon={alert.icon ?? SEVERITY_ICON[alert.severity]} size={18} className="mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">{alert.title}</p>
            <p className="mt-0.5 text-xs opacity-90">{alert.description}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
