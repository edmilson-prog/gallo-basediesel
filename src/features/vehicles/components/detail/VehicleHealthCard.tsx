import type { IVehicle } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { computeHealth } from "../../utils/vehicleHealth";
import { HEALTH_STATUS_META } from "../../utils/vehicleDisplay";
import { VehicleHealthRing } from "./VehicleHealthRing";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.health;

export interface IVehicleHealthCardProps {
  vehicle: IVehicle;
  className?: string;
}

/** Vehicle-health ring gauge driven by the maintenance rules. Color + icon + text (never color alone). */
export function VehicleHealthCard({ vehicle, className }: IVehicleHealthCardProps) {
  const health = computeHealth(vehicle);
  const meta = HEALTH_STATUS_META[health.status];

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
      <VehicleHealthRing health={health} size={128} />
      <p className="mt-3 flex items-center gap-1.5 text-center text-xs text-muted-foreground">
        <Icon icon={meta.icon} size={13} className={meta.text} />
        {health.status === "unknown"
          ? COPY.unknownTitle
          : COPY.summary(health.overdueCount, health.upcomingCount)}
      </p>
    </section>
  );
}
