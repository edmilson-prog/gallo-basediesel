import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.bulk;

export interface IVehiclesBulkActionsBarProps {
  count: number;
  canApprove: boolean;
  onApprove: () => void;
  onReject: () => void;
  onClear: () => void;
}

export function VehiclesBulkActionsBar({
  count,
  canApprove,
  onApprove,
  onReject,
  onClear,
}: IVehiclesBulkActionsBarProps) {
  if (count === 0 || !canApprove) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary/5 px-4 py-2 text-sm">
      <Icon icon="mdi:checkbox-multiple-marked-outline" size={16} className="text-primary" />
      <span className="font-medium text-foreground">
        {count} {count === 1 ? "selecionado" : "selecionados"}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onApprove}>
          <Icon icon="mdi:check-circle-outline" size={14} />
          {COPY.approveLabel}
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={onReject}>
          <Icon icon="mdi:close-circle-outline" size={14} />
          {COPY.rejectLabel}
        </Button>
        <Button variant="ghost" size="sm" className="text-xs" onClick={onClear}>
          {COPY.clear}
        </Button>
      </div>
    </div>
  );
}
