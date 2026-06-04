import type { ForecastMetric, IForecastBreakdown } from "@/shared/types/forecast";
import { cn } from "@/lib/utils";
import { formatGoalValue } from "@/features/goals/utils/formatGoalValue";

export interface IForecastBreakdownProps {
  breakdown: IForecastBreakdown;
  metric: ForecastMetric;
}

interface ISegment {
  key: "realized" | "weightedPipeline" | "runRateRemainder";
  label: string;
  value: number;
  /** Bar segment color. */
  barClassName: string;
  /** Legend dot color. */
  dotClassName: string;
  /** Extra classes applied only on the bar segment. */
  barExtra?: string;
}

/**
 * Composition breakdown of a forecast scenario rendered as a stacked CSS bar
 * (realized → weighted pipeline → run-rate) plus a textual legend table so the
 * information is never conveyed by color alone (WCAG AA).
 */
export function ForecastBreakdown({ breakdown, metric }: IForecastBreakdownProps) {
  const segments: ISegment[] = [
    {
      key: "realized",
      label: "Realizado",
      value: breakdown.realized,
      barClassName: "bg-primary",
      dotClassName: "bg-primary",
    },
    {
      key: "weightedPipeline",
      label: "Pipeline ponderado",
      value: breakdown.weightedPipeline,
      barClassName: "bg-primary/45",
      dotClassName: "bg-primary/45",
    },
    {
      key: "runRateRemainder",
      label: "Ritmo",
      value: breakdown.runRateRemainder,
      barClassName: "bg-muted-foreground/30",
      dotClassName: "bg-muted-foreground/30",
      barExtra: "border-l border-dashed border-background",
    },
  ];

  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);

  const ariaLabel = `Composição: ${segments
    .map((segment) => `${segment.label.toLowerCase()} ${formatGoalValue(metric, segment.value)}`)
    .join(", ")}`;

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
      >
        {segments.map((segment) => {
          const width = total > 0 ? (Math.max(0, segment.value) / total) * 100 : 0;
          if (width <= 0) return null;
          return (
            <div
              key={segment.key}
              aria-hidden
              className={cn(
                "h-full transition-all duration-300",
                segment.barClassName,
                segment.barExtra,
              )}
              style={{ width: `${width}%` }}
            />
          );
        })}
      </div>

      <ul className="flex flex-col gap-1.5">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span aria-hidden className={cn("size-2 rounded-full", segment.dotClassName)} />
              {segment.label}
            </span>
            <span className="font-mono tabular-nums text-foreground">
              {formatGoalValue(metric, segment.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
