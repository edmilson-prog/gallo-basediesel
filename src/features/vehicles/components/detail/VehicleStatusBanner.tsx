import type { IVehicle } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.statusBanner;

export interface IVehicleStatusBannerProps {
  vehicle: IVehicle;
  canApprove: boolean;
  onApprove: () => void;
  onReject: () => void;
}

export function VehicleStatusBanner({
  vehicle,
  canApprove,
  onApprove,
  onReject,
}: IVehicleStatusBannerProps) {
  if (vehicle.cadastroStatus === "aprovado") return null;
  if (vehicle.cadastroStatus === "pendente") {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-md border border-severity-warning/30 bg-severity-warning/10 px-4 py-3 text-sm",
          "text-severity-warning",
        )}
      >
        <Icon
          icon="mdi:clock-alert-outline"
          size={18}
          className="text-severity-warning"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{COPY.pendingTitle}</p>
          <p className="text-xs opacity-80">{COPY.pendingDescription}</p>
        </div>
        {canApprove && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onApprove}>
              <Icon icon="mdi:check" size={14} />
              {COPY.approve}
            </Button>
            <Button size="sm" variant="ghost" onClick={onReject}>
              <Icon icon="mdi:close" size={14} />
              {COPY.reject}
            </Button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <Icon icon="mdi:close-circle-outline" size={18} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{COPY.rejectedTitle}</p>
        <p className="text-xs opacity-80">{COPY.rejectedDescription}</p>
      </div>
    </div>
  );
}
