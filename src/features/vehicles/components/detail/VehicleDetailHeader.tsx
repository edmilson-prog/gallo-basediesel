import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import type { IVehicle } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  STATUS_BADGE_CLASSES,
  STATUS_LABEL,
  formatPlate,
  iconForBrand,
} from "../../utils/vehicleDisplay";
import { vehicleFicha } from "../../utils/vehicleFicha";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";
import { VehicleLayoutSwitcher } from "./VehicleLayoutSwitcher";
import type { VehicleDetailLayout } from "../../config/layout";

const COPY = VEHICLE_STRINGS.detail;
const MENU_COPY = VEHICLE_STRINGS.list.rowMenu;

export interface IVehicleDetailHeaderProps {
  vehicle: IVehicle;
  canEdit: boolean;
  onEdit: () => void;
  onAddService: () => void;
  onRequestLinkModel: () => void;
  onUpdateKm: () => void;
  layout: VehicleDetailLayout;
  onLayoutChange: (layout: VehicleDetailLayout) => void;
}

export function VehicleDetailHeader({
  vehicle,
  canEdit,
  onEdit,
  onAddService,
  onRequestLinkModel,
  onUpdateKm,
  layout,
  onLayoutChange,
}: IVehicleDetailHeaderProps) {
  const ficha = vehicleFicha(vehicle);
  // Approved is the resting state — only an exception earns a badge here.
  const showStatusBadge = vehicle.cadastroStatus !== "aprovado";

  const copyPlate = async () => {
    if (!vehicle.plate) return;
    try {
      await navigator.clipboard.writeText(formatPlate(vehicle.plate));
      toast.success(MENU_COPY.copiedPlate(formatPlate(vehicle.plate)));
    } catch {
      toast.error(MENU_COPY.copyPlateError);
    }
  };

  return (
    <div className="border-b border-border bg-card">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6">
        <Link
          to="/app/veiculos"
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Icon icon="mdi:arrow-left" size={14} />
          {COPY.backToList}
        </Link>
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Icon icon={iconForBrand(vehicle.brand)} size={28} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-foreground sm:text-xl">
              <span>
                {vehicle.brand && vehicle.brand !== "Outra" ? `${vehicle.brand} ` : ""}
                {vehicle.model}{" "}
                <span className="text-base font-normal text-muted-foreground">
                  · {vehicle.year}
                </span>
              </span>
              {showStatusBadge && (
                <Badge
                  variant="outline"
                  className={cn("gap-1 text-xs", STATUS_BADGE_CLASSES[vehicle.cadastroStatus])}
                >
                  {vehicle.cadastroStatus === "pendente" && (
                    <Icon icon="mdi:clock-alert-outline" size={11} />
                  )}
                  {STATUS_LABEL[vehicle.cadastroStatus]}
                </Badge>
              )}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="rounded border border-border bg-muted px-1.5 font-mono uppercase text-foreground">
                {formatPlate(vehicle.plate)}
              </span>
              <span className={cn(!vehicle.engine && "text-muted-foreground/70")}>
                {vehicle.engine || COPY.engineUnknown}
              </span>
              {!ficha.isComplete && (
                <span
                  title={COPY.ficha.missingList(ficha.missing.map((m) => m.label))}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-severity-warning"
                >
                  <Icon icon="mdi:format-list-checks" size={13} />
                  {COPY.ficha.indicator(ficha.done, ficha.total)}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <VehicleLayoutSwitcher value={layout} onChange={onLayoutChange} />
            {canEdit && (
              <>
                {vehicle.modelId == null && (
                  <Button variant="outline" size="sm" onClick={onRequestLinkModel}>
                    <Icon icon="mdi:link-variant" size={14} />
                    {COPY.linkModel.trigger}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Icon icon="mdi:pencil" size={14} />
                  {COPY.edit}
                </Button>
                {/* The one primary action on the page — it used to appear three times. */}
                <Button size="sm" onClick={onAddService}>
                  <Icon icon="mdi:wrench" size={14} />
                  {COPY.addService}
                </Button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  aria-label={MENU_COPY.trigger}
                >
                  <Icon icon="mdi:dots-vertical" size={18} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {canEdit && (
                  <DropdownMenuItem onSelect={() => onUpdateKm()}>
                    <Icon icon="mdi:counter" size={14} />
                    {COPY.updateKm}
                  </DropdownMenuItem>
                )}
                {vehicle.plate && (
                  <DropdownMenuItem onSelect={() => void copyPlate()}>
                    <Icon icon="mdi:content-copy" size={14} />
                    {MENU_COPY.copyPlate}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
