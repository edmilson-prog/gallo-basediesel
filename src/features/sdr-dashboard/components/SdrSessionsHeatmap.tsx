import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";

export interface ISdrSessionsHeatmapProps {
  data: { day: number; hour: number; count: number }[];
  onCellClick?: () => void;
}

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function intensityClass(value: number, max: number): string {
  if (value === 0 || max === 0) return "fill-muted/30";
  const ratio = value / max;
  if (ratio < 0.2) return "fill-primary/15";
  if (ratio < 0.4) return "fill-primary/30";
  if (ratio < 0.6) return "fill-primary/55";
  if (ratio < 0.8) return "fill-primary/75";
  return "fill-primary";
}

export function SdrSessionsHeatmap({ data, onCellClick }: ISdrSessionsHeatmapProps) {
  const max = useMemo(() => data.reduce((acc, c) => Math.max(acc, c.count), 0), [data]);
  const total = useMemo(() => data.reduce((acc, c) => acc + c.count, 0), [data]);
  const [hover, setHover] = useState<{ day: number; hour: number; count: number } | null>(null);

  const cellSize = 14;
  const gap = 2;
  const labelColW = 28;
  const labelRowH = 14;
  const gridW = labelColW + 24 * (cellSize + gap);
  const gridH = labelRowH + 7 * (cellSize + gap);

  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Volume por hora e dia
          </h2>
          <p className="text-xs text-muted-foreground">
            Identifique picos de uso do SDR para calibrar cobertura humana.
          </p>
        </div>
        <Icon icon="mdi:chart-timeline-variant" size={20} className="text-muted-foreground" />
      </header>
      {total === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Sem dados no período selecionado.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <svg
              role="img"
              aria-label="Heatmap de sessões SDR"
              viewBox={`0 0 ${gridW} ${gridH}`}
              width="100%"
              className="min-w-[420px] max-w-full"
            >
              {Array.from({ length: 24 }, (_, h) => h).map((h) =>
                h % 3 === 0 ? (
                  <text
                    key={`h-${h}`}
                    x={labelColW + h * (cellSize + gap) + cellSize / 2}
                    y={labelRowH - 4}
                    textAnchor="middle"
                    fontSize="9"
                    className="fill-muted-foreground"
                  >
                    {h.toString().padStart(2, "0")}
                  </text>
                ) : null,
              )}
              {DAYS.map((label, day) => (
                <text
                  key={`d-${day}`}
                  x={0}
                  y={labelRowH + day * (cellSize + gap) + cellSize / 2 + 3}
                  fontSize="9"
                  className="fill-muted-foreground"
                >
                  {label}
                </text>
              ))}
              {data.map((cell) => {
                const x = labelColW + cell.hour * (cellSize + gap);
                const y = labelRowH + cell.day * (cellSize + gap);
                const isHovered = hover?.day === cell.day && hover?.hour === cell.hour;
                return (
                  <rect
                    key={`cell-${cell.day}-${cell.hour}`}
                    x={x}
                    y={y}
                    width={cellSize}
                    height={cellSize}
                    rx={2}
                    className={`${intensityClass(cell.count, max)} ${
                      onCellClick ? "cursor-pointer" : ""
                    } transition-opacity ${isHovered ? "opacity-80" : ""}`}
                    stroke={isHovered ? "currentColor" : "none"}
                    strokeWidth={isHovered ? 1 : 0}
                    onMouseEnter={() =>
                      setHover({ day: cell.day, hour: cell.hour, count: cell.count })
                    }
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover({ day: cell.day, hour: cell.hour, count: cell.count })}
                    onBlur={() => setHover(null)}
                    onClick={() => onCellClick?.()}
                    tabIndex={onCellClick ? 0 : -1}
                  >
                    <title>{`${DAYS[cell.day]} ${cell.hour.toString().padStart(2, "0")}h — ${cell.count} sessões`}</title>
                  </rect>
                );
              })}
            </svg>
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {hover
              ? `${DAYS[hover.day]} ${hover.hour.toString().padStart(2, "0")}h — ${hover.count} sessões`
              : "Passe o mouse sobre uma célula para detalhes."}
          </p>
        </>
      )}
    </Card>
  );
}
