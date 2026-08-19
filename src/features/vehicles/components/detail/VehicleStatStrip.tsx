import type { IVehicle } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { daysSince } from "@/shared/utils/format";
import { formatKm } from "../../utils/vehicleDisplay";
import { computeHealth } from "../../utils/vehicleHealth";
import { lastServiceEntry, nextMaintenance } from "../../utils/vehicleKpis";
import { usagePerYear } from "../../utils/kmSeries";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.statStrip;

interface IStatCell {
  icon: string;
  label: string;
  value: React.ReactNode;
  accent?: "warn" | "danger";
}

export interface IVehicleStatStripProps {
  vehicle: IVehicle;
  now?: Date;
}

/** Full-width KPI strip mirroring the customer detail pattern (hairline cells). */
export function VehicleStatStrip({ vehicle, now = new Date() }: IVehicleStatStripProps) {
  const next = nextMaintenance(vehicle);
  const { overdueCount, status } = computeHealth(vehicle);
  const last = lastServiceEntry(vehicle);
  const recency = last ? daysSince(last.date, now) : null;
  const usage = usagePerYear(vehicle, now);
  // No odometer, no ruler: "Em dia" / "Nenhuma" would be a verdict the data
  // cannot support — the same lie the health ring refuses to tell.
  const unmeasured = status === "unknown";

  const cells: IStatCell[] = [
    { icon: "mdi:counter", label: COPY.currentKm, value: formatKm(vehicle.currentKm) },
    {
      icon: "mdi:wrench-clock",
      label: COPY.nextMaintenance,
      value: unmeasured
        ? COPY.noKm
        : next
          ? COPY.nextMaintenanceValue(next.remainingKm, next.label)
          : COPY.nextNone,
      accent: !unmeasured && next ? "warn" : undefined,
    },
    {
      icon: "mdi:alert-octagon-outline",
      label: COPY.overdue,
      value: unmeasured ? COPY.empty : overdueCount > 0 ? String(overdueCount) : COPY.overdueNone,
      accent: overdueCount > 0 ? "danger" : undefined,
    },
    {
      icon: "mdi:calendar-clock",
      label: COPY.lastVisit,
      value: recency === null ? COPY.noVisit : COPY.daysAgo(recency),
    },
    {
      icon: "mdi:speedometer",
      label: COPY.usage,
      value: usage === null ? COPY.empty : COPY.usageValue(usage),
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-3 lg:grid-cols-5">
      {cells.map((cell) => (
        <div key={cell.label} className="bg-card px-4 py-3">
          <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Icon icon={cell.icon} size={11} />
            {cell.label}
          </dt>
          <dd
            className={cn(
              "mt-1 text-sm font-semibold tabular-nums text-foreground",
              cell.accent === "warn" && "text-severity-warning",
              cell.accent === "danger" && "text-destructive",
            )}
          >
            {cell.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
