import { cn } from "@/lib/utils";
import type { Granularity } from "@/shared/types";
import type { VolumePeriod } from "../hooks/useServiceVolumeFilters";
import { SERVICE_VOLUME_STRINGS as S } from "../i18n/pt-BR";

const GRANS: { value: Granularity; label: string }[] = [
  { value: "day", label: S.granularityDay },
  { value: "week", label: S.granularityWeek },
  { value: "month", label: S.granularityMonth },
];
const PERIODS: { value: VolumePeriod; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
];

export interface IServiceVolumeFiltersProps {
  granularity: Granularity;
  period: VolumePeriod;
  onGranularity: (g: Granularity) => void;
  onPeriod: (p: VolumePeriod) => void;
}

export function ServiceVolumeFilters({ granularity, period, onGranularity, onPeriod }: IServiceVolumeFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
        {GRANS.map((g) => (
          <button
            key={g.value}
            type="button"
            onClick={() => onGranularity(g.value)}
            className={cn(
              "cursor-pointer px-3 py-1.5 transition-colors",
              granularity === g.value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onPeriod(p.value)}
            className={cn(
              "cursor-pointer px-3 py-1.5 transition-colors",
              period === p.value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
