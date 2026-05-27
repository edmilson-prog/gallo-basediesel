import type { IDREAlert } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { DRE_STRINGS as S } from "../i18n/pt-BR";

export interface IDREAlertsBannerProps {
  alerts: IDREAlert[];
}

const SEVERITY_CLASSES: Record<IDREAlert["severity"], string> = {
  info: "border-info/40 bg-info/10",
  warning: "border-warning/50 bg-warning/10",
  critical: "border-destructive/50 bg-destructive/10",
};

const SEVERITY_ICON_CLASSES: Record<IDREAlert["severity"], string> = {
  info: "text-info",
  warning: "text-warning",
  critical: "text-destructive",
};

export function DREAlertsBanner({ alerts }: IDREAlertsBannerProps) {
  if (alerts.length === 0) return null;
  return (
    <section className="space-y-2" aria-label={S.alertsTitle}>
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={cn(
            "flex items-start gap-3 rounded-md border px-4 py-3 text-sm",
            SEVERITY_CLASSES[alert.severity],
          )}
          role={alert.severity === "critical" ? "alert" : "status"}
        >
          <Icon
            icon={alert.icon ?? "mdi:alert-circle-outline"}
            size={20}
            className={cn("mt-0.5 shrink-0", SEVERITY_ICON_CLASSES[alert.severity])}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{alert.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{alert.description}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
