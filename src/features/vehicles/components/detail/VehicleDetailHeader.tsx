import { Link } from "@tanstack/react-router";
import type { IVehicle } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { STATUS_BADGE_CLASSES, STATUS_LABEL, iconForBrand } from "../../utils/vehicleDisplay";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";
import { VehicleLayoutSwitcher } from "./VehicleLayoutSwitcher";
import type { VehicleDetailLayout } from "../../config/layout";

export interface IVehicleDetailHeaderProps {
  vehicle: IVehicle;
  canEdit: boolean;
  onEdit: () => void;
  onAddService: () => void;
  layout: VehicleDetailLayout;
  onLayoutChange: (layout: VehicleDetailLayout) => void;
}

export function VehicleDetailHeader({
  vehicle,
  canEdit,
  onEdit,
  onAddService,
  layout,
  onLayoutChange,
}: IVehicleDetailHeaderProps) {
  return (
    <div className="border-b border-border bg-card">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6">
        <Link
          to="/app/veiculos"
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Icon icon="mdi:arrow-left" size={14} />
          {VEHICLE_STRINGS.detail.backToList}
        </Link>
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Icon icon={iconForBrand(vehicle.brand)} size={28} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-foreground sm:text-xl">
              <span>
                {vehicle.brand} {vehicle.model}{" "}
                <span className="text-base font-normal text-muted-foreground">
                  · {vehicle.year}
                </span>
              </span>
              <Badge
                variant="outline"
                className={cn("text-xs", STATUS_BADGE_CLASSES[vehicle.cadastroStatus])}
              >
                {STATUS_LABEL[vehicle.cadastroStatus]}
              </Badge>
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="rounded border border-border bg-muted px-1.5 font-mono uppercase text-foreground">
                {vehicle.plate ?? "—"}
              </span>
              <span aria-hidden>·</span>
              <span>{vehicle.engine || "—"}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <VehicleLayoutSwitcher value={layout} onChange={onLayoutChange} />
            {canEdit && (
              <>
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Icon icon="mdi:pencil" size={14} />
                  {VEHICLE_STRINGS.detail.edit}
                </Button>
                <Button size="sm" onClick={onAddService}>
                  <Icon icon="mdi:wrench" size={14} />
                  {VEHICLE_STRINGS.detail.addService}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
