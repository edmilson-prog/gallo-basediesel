import type { IVehicle } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { computeHealth, type VehicleHealthStatus } from "../../utils/vehicleHealth";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.health;

const STATUS_META: Record<
  VehicleHealthStatus,
  { label: string; ring: string; text: string; icon: string }
> = {
  ok: {
    label: COPY.ok,
    ring: "text-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    icon: "mdi:check-circle-outline",
  },
  attention: {
    label: COPY.attention,
    ring: "text-amber-500",
    text: "text-amber-600 dark:text-amber-300",
    icon: "mdi:alert-circle-outline",
  },
  overdue: {
    label: COPY.overdue,
    ring: "text-destructive",
    text: "text-destructive",
    icon: "mdi:alert-octagon-outline",
  },
};

const RADIUS = 34;
const CIRC = 2 * Math.PI * RADIUS;

export interface IVehicleHealthCardProps {
  vehicle: IVehicle;
  className?: string;
}

/** Vehicle-health ring gauge driven by the maintenance rules. Color + icon + text (never color alone). */
export function VehicleHealthCard({ vehicle, className }: IVehicleHealthCardProps) {
  const { score, status, overdueCount, upcomingCount } = computeHealth(vehicle);
  const meta = STATUS_META[status];
  const offset = CIRC * (1 - score / 100);

  return (
    <section
      className={cn(
        "flex flex-col items-center rounded-lg border border-border bg-card p-4",
        className,
      )}
    >
      <h2 className="mb-3 flex w-full items-center gap-1.5 text-sm font-semibold text-foreground">
        <Icon icon="mdi:heart-pulse" size={16} className="text-muted-foreground" />
        {COPY.title}
      </h2>
      <div
        className="relative grid h-32 w-32 place-items-center"
        role="img"
        aria-label={COPY.ariaLabel(score, meta.label)}
      >
        <svg viewBox="0 0 80 80" className="h-32 w-32 -rotate-90">
          <circle cx="40" cy="40" r={RADIUS} fill="none" stroke="var(--border)" strokeWidth="7" />
          <circle
            cx="40"
            cy="40"
            r={RADIUS}
            fill="none"
            className={meta.ring}
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-2xl font-bold tabular-nums text-foreground">{score}</span>
          <span className={cn("text-xs font-medium", meta.text)}>{meta.label}</span>
        </div>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon icon={meta.icon} size={13} className={meta.text} />
        {COPY.summary(overdueCount, upcomingCount)}
      </p>
    </section>
  );
}
