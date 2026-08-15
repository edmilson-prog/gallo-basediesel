import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { ISdrAlert, SdrAlertSeverity } from "../hooks/useSdrAlerts";

const SEVERITY_CLASS: Record<SdrAlertSeverity, string> = {
  info: "border-severity-info/30 bg-severity-info/10 text-severity-info",
  warning: "border-severity-warning/30 bg-severity-warning/10 text-severity-warning",
  danger: "border-severity-critical/30 bg-severity-critical/10 text-severity-critical",
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
