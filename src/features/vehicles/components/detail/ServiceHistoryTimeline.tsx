import { useMemo } from "react";
import type { IVehicle, IVehicleServiceEntry } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { formatDateBR } from "@/shared/utils/format";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.history;
const SECTION_COPY = VEHICLE_STRINGS.detail.sections;

export interface IServiceHistoryTimelineProps {
  vehicle: IVehicle;
}

export function ServiceHistoryTimeline({ vehicle }: IServiceHistoryTimelineProps) {
  const sorted = useMemo<IVehicleServiceEntry[]>(
    () => [...vehicle.serviceHistory].sort((a, b) => b.date.localeCompare(a.date)),
    [vehicle.serviceHistory],
  );

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {SECTION_COPY.history}
      </h2>
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
          <Icon icon="mdi:wrench-clock" size={20} className="text-muted-foreground" />
          <p className="text-xs text-muted-foreground">{COPY.empty}</p>
        </div>
      ) : (
        <ol className="relative space-y-3 border-l border-border pl-4">
          {sorted.map((entry) => (
            <li key={entry.id} className="relative">
              <span className="absolute -left-[21px] top-1 grid h-3 w-3 place-items-center rounded-full border border-border bg-primary" />
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {formatDateBR(entry.date)}
                  </span>
                  {entry.km !== undefined && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {entry.km.toLocaleString("pt-BR")} km
                    </span>
                  )}
                </div>
                {entry.parts.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {entry.parts.map((p, i) => (
                      <Badge
                        key={`${entry.id}-${i}`}
                        variant="outline"
                        className="text-[10px] text-muted-foreground"
                      >
                        {p}
                      </Badge>
                    ))}
                  </div>
                )}
                {entry.orderId && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    <Icon icon="mdi:link-variant" size={10} className="-mt-0.5 inline" />{" "}
                    {COPY.derivedFromOrder} {entry.orderId}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
