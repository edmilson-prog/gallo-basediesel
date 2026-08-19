import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { IVehiclesListFilters } from "../../utils/listFilters";
import type { IVehiclesQueueCounts } from "../../hooks/useVehiclesQueueCounts";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.list.queue;

export interface IVehiclesQueueChipsProps {
  filters: IVehiclesListFilters;
  patch: (patch: Partial<IVehiclesListFilters>) => void;
  counts: IVehiclesQueueCounts;
  className?: string;
}

/**
 * The enrichment queue, as three toggles with live counts.
 *
 * These are the questions the imported fleet actually raises — what is waiting
 * for approval, what has no odometer, what has no catalogue model — promoted
 * out of the filter popovers and into the header, where the size of each
 * backlog is visible without opening anything.
 */
export function VehiclesQueueChips({
  filters,
  patch,
  counts,
  className,
}: IVehiclesQueueChipsProps) {
  const onlyPending =
    filters.cadastroStatuses.length === 1 && filters.cadastroStatuses[0] === "pendente";

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
        <QueueChip
          icon="mdi:clock-alert-outline"
          label={COPY.pending}
          hint={COPY.pendingHint}
          count={counts.pending}
          active={onlyPending}
          onToggle={() => patch({ cadastroStatuses: onlyPending ? [] : ["pendente"] })}
        />
        <QueueChip
          icon="mdi:counter"
          label={COPY.withoutKm}
          hint={COPY.withoutKmHint}
          count={counts.withoutKm}
          active={filters.withoutKm}
          onToggle={() => patch({ withoutKm: !filters.withoutKm })}
        />
        <QueueChip
          icon="mdi:link-variant-off"
          label={COPY.withoutModel}
          hint={COPY.withoutModelHint}
          count={counts.withoutModel}
          active={filters.withoutModel}
          onToggle={() => patch({ withoutModel: !filters.withoutModel })}
        />
      </div>
    </TooltipProvider>
  );
}

interface IQueueChipProps {
  icon: string;
  label: string;
  hint: string;
  count: number;
  active: boolean;
  onToggle: () => void;
}

function QueueChip({ icon, label, hint, count, active, onToggle }: IQueueChipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={active}
          onClick={onToggle}
          className={cn(
            "h-8 gap-1.5 rounded-full text-xs",
            active &&
              "border-severity-warning/40 bg-severity-warning/10 text-severity-warning hover:bg-severity-warning/15",
          )}
        >
          <Icon icon={icon} size={14} />
          {label}
          <span
            className={cn(
              "rounded-full px-1.5 py-0 text-[10px] font-semibold tabular-nums",
              active ? "bg-severity-warning/20" : "bg-muted text-muted-foreground",
            )}
          >
            {count.toLocaleString("pt-BR")}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}
