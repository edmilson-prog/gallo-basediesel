import type { IVehicle } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { rankParts } from "../../utils/partsRanking";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.parts;

export interface IMostReplacedPartsCardProps {
  vehicle: IVehicle;
  className?: string;
}

export function MostReplacedPartsCard({ vehicle, className }: IMostReplacedPartsCardProps) {
  const ranked = rankParts(vehicle);
  const max = ranked[0]?.count ?? 1;

  return (
    <section className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Icon icon="mdi:podium" size={16} className="text-muted-foreground" />
        {COPY.title}
      </h2>
      {ranked.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">{COPY.empty}</p>
      ) : (
        <ul className="space-y-2.5">
          {ranked.map((part) => (
            <li key={part.name} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-foreground">{part.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {COPY.times(part.count)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(part.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
