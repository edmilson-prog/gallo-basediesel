import type { IVehicle } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { vehicleFicha } from "../utils/vehicleFicha";
import { VEHICLE_STRINGS } from "../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.list.ficha;

export interface IVehicleFichaChipsProps {
  vehicle: IVehicle;
  /** How many gaps to spell out before collapsing the rest into "+N". */
  max?: number;
  className?: string;
}

/** What the cadastro is still missing, as chips — the list's enrichment cue. */
export function VehicleFichaChips({ vehicle, max = 2, className }: IVehicleFichaChipsProps) {
  const ficha = vehicleFicha(vehicle);

  if (ficha.isComplete) {
    return (
      <span
        className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}
      >
        <Icon icon="mdi:check-circle-outline" size={14} className="text-severity-success" />
        {COPY.complete}
      </span>
    );
  }

  const shown = ficha.missing.slice(0, max);
  const hidden = ficha.missing.length - shown.length;
  const allLabels = ficha.missing.map((m) => m.label);

  return (
    <div
      className={cn("flex min-w-0 items-center gap-1", className)}
      title={COPY.missingList(allLabels)}
    >
      {shown.map((gap) => (
        <span
          key={gap.key}
          className="shrink-0 whitespace-nowrap rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
        >
          {COPY.missing(gap.label)}
        </span>
      ))}
      {hidden > 0 && (
        <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">
          {COPY.more(hidden)}
        </span>
      )}
    </div>
  );
}
