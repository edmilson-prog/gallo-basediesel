import type { ISeriesPoint } from "../../engine/analysis";

export interface IPriceSeriesProps {
  points: ISeriesPoint[];
}

/**
 * Série de preço em `div`s. Seis pontos não justificam uma biblioteca de
 * gráfico — e uma a mais esbarraria no guard de 24h do `bunfig.toml`.
 */
export function PriceSeries({ points }: IPriceSeriesProps) {
  const max = Math.max(...points.map((point) => point.value), 1);

  return (
    <div className="mt-3 flex h-14 items-end gap-1.5" role="img" aria-label="Série de preço">
      {points.map((point, index) => {
        const isLast = index === points.length - 1;
        return (
          <div key={`${point.label}-${index}`} className="flex flex-1 flex-col items-center gap-1">
            <span
              className={`text-[9.5px] tabular-nums ${isLast ? "text-primary" : "text-muted-foreground"}`}
            >
              {Math.round(point.value)}
            </span>
            <span
              className={`w-full rounded-t ${isLast ? "bg-primary" : "bg-muted-foreground/25"}`}
              style={{ height: Math.max(6, (point.value / max) * 34) }}
            />
            <span className="text-[9px] text-muted-foreground">{point.label}</span>
          </div>
        );
      })}
    </div>
  );
}
