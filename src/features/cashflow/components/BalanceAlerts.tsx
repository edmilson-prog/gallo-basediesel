import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { CashFlowAlertSeverity, ICashFlowAlert } from "../hooks/useCashFlowAlerts";

const SEVERITY_CLASSES: Record<CashFlowAlertSeverity, string> = {
  info: "border-info/40 bg-info/10 text-foreground",
  warning: "border-warning/40 bg-warning/10 text-foreground",
  critical: "border-destructive/40 bg-destructive/10 text-foreground",
};

const SEVERITY_ICONS: Record<CashFlowAlertSeverity, string> = {
  info: "mdi:information-outline",
  warning: "mdi:alert-outline",
  critical: "mdi:alert-octagon-outline",
};

export function BalanceAlerts({ alerts }: { alerts: ICashFlowAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          className={cn(
            "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
            SEVERITY_CLASSES[a.severity],
          )}
        >
          <Icon icon={SEVERITY_ICONS[a.severity]} size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">{a.title}</p>
            <p className="text-xs text-muted-foreground">{a.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
