import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type {
  CustomerAlertSeverity,
  CustomerAlertTarget,
  ICustomerAlert,
} from "../../engine/customerAlerts";

/**
 * One class set per severity. Critical is deliberately the only red: a customer
 * whose registration is merely incomplete is not an emergency, and painting it
 * red is how a UI teaches people to ignore red.
 */
const SEVERITY_CLASSES: Record<CustomerAlertSeverity, { box: string; icon: string; cta: string }> =
  {
    critical: {
      box: "border-severity-critical/30 bg-severity-critical/[0.07]",
      icon: "text-severity-critical",
      cta: "text-severity-critical",
    },
    warning: {
      box: "border-severity-warning/30 bg-severity-warning/[0.07]",
      icon: "text-severity-warning",
      cta: "text-severity-warning",
    },
    info: {
      box: "border-severity-info/30 bg-severity-info/[0.07]",
      icon: "text-severity-info",
      cta: "text-severity-info",
    },
  };

export interface ICustomerAlertsBandProps {
  alerts: ICustomerAlert[];
  onGoToTab: (target: CustomerAlertTarget) => void;
  /** Drops the detail line — used inside the Atendimento tab's narrow column. */
  compact?: boolean;
  className?: string;
}

/**
 * Band 4 — pending items, or nothing at all.
 *
 * Returns null on an empty list by design. The old card rendered a highlighted
 * box saying "Tudo em dia", which spent the most attention-grabbing element on
 * the page to report a non-event.
 */
export function CustomerAlertsBand({
  alerts,
  onGoToTab,
  compact,
  className,
}: ICustomerAlertsBandProps) {
  if (alerts.length === 0) return null;

  return (
    <ul className={cn("space-y-1.5", className)}>
      {alerts.map((alert) => {
        const classes = SEVERITY_CLASSES[alert.severity];
        return (
          <li key={alert.id}>
            <div
              className={cn("flex items-center gap-2.5 rounded-md border px-3 py-2", classes.box)}
            >
              <Icon icon={alert.icon} size={16} className={cn("shrink-0", classes.icon)} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold text-foreground">
                  {alert.title}
                </div>
                {!compact && (
                  <div className="truncate text-[11.5px] text-muted-foreground">{alert.detail}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => onGoToTab(alert.target)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded text-[11.5px] font-semibold hover:underline focus:outline-none focus:ring-2 focus:ring-ring",
                  classes.cta,
                )}
              >
                {alert.cta}
                <Icon icon="mdi:arrow-right" size={12} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
