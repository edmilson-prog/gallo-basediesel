import type { IVehicle } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { computeHealth } from "../../utils/vehicleHealth";
import { HEALTH_STATUS_META } from "../../utils/vehicleDisplay";
import { VehicleHealthRing } from "./VehicleHealthRing";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.health;

export interface IVehicleHealthBlockProps {
  vehicle: IVehicle;
  /** Opens the km modal — the single thing that unblocks an unknown health. */
  onUpdateKm?: () => void;
  size?: number;
  className?: string;
}

/**
 * Horizontal ring + verdict, for the "Situação de manutenção" band.
 *
 * With no odometer it does not hedge with a dash and move on: it says why the
 * score is absent and offers the one input that produces it.
 */
export function VehicleHealthBlock({
  vehicle,
  onUpdateKm,
  size = 104,
  className,
}: IVehicleHealthBlockProps) {
  const health = computeHealth(vehicle);
  const meta = HEALTH_STATUS_META[health.status];

  if (health.status === "unknown") {
    return (
      <div className={cn("flex items-center gap-4", className)}>
        <VehicleHealthRing health={health} size={size} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{COPY.unknownTitle}</p>
          <p className="mt-1 max-w-[260px] text-xs leading-relaxed text-muted-foreground">
            {COPY.unknownDescription}
          </p>
          {onUpdateKm && (
            <Button variant="outline" size="sm" className="mt-2.5 text-xs" onClick={onUpdateKm}>
              <Icon icon="mdi:counter" size={14} />
              {COPY.unknownCta}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <VehicleHealthRing health={health} size={size} />
      <div className="min-w-0">
        <p className={cn("flex items-center gap-1.5 text-sm font-semibold", meta.text)}>
          <Icon icon={meta.icon} size={15} />
          {meta.label}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {COPY.summary(health.overdueCount, health.upcomingCount)}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground/80">{COPY.rulerHint}</p>
      </div>
    </div>
  );
}
