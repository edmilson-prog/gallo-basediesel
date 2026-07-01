import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { InfoHint } from "@/components/InfoHint";
import { SERVICE_VOLUME_STRINGS } from "../i18n/pt-BR";
import type { IVolumeHeatmapData } from "../hooks/useVolumeHeatmap";

export interface IVolumeHeatmapProps {
  data: IVolumeHeatmapData;
  isLoading: boolean;
  onCellClick?: (day: number, hour: number) => void;
}

interface IHoverState {
  day: number;
  hour: number;
  count: number;
}

function intensityClass(value: number, max: number): string {
  if (value === 0 || max === 0) return "fill-muted/30";
  const ratio = value / max;
  if (ratio < 0.2) return "fill-primary/15";
  if (ratio < 0.4) return "fill-primary/30";
  if (ratio < 0.6) return "fill-primary/55";
  if (ratio < 0.8) return "fill-primary/75";
  return "fill-primary";
}

function legendIntensity(level: number): string {
  if (level === 0) return "fill-muted/30";
  if (level === 1) return "fill-primary/15";
  if (level === 2) return "fill-primary/30";
  if (level === 3) return "fill-primary/55";
  if (level === 4) return "fill-primary/75";
  return "fill-primary";
}

export function VolumeHeatmap({ data, isLoading, onCellClick }: IVolumeHeatmapProps) {
  const [hover, setHover] = useState<IHoverState | null>(null);

  const labelDays = SERVICE_VOLUME_STRINGS.heatmapDays;
  const hours = useMemo(() => Array.from({ length: 24 }, (_, h) => h), []);
  // Layout constants (pixel-based, scales fine when contained in flex).
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
          <h2 className="flex items-center gap-1.5 text-base font-semibold tracking-tight text-foreground">
            {SERVICE_VOLUME_STRINGS.heatmapTitle}
            <InfoHint
              text={SERVICE_VOLUME_STRINGS.heatmapHelp}
              label={SERVICE_VOLUME_STRINGS.heatmapTitle}
            />
          </h2>
          <p className="text-xs text-muted-foreground">
            {SERVICE_VOLUME_STRINGS.heatmapSubtitle}
          </p>
        </div>
        <Icon icon="mdi:chart-timeline-variant" size={20} className="text-muted-foreground" />
      </header>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : data.totalMessages === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {SERVICE_VOLUME_STRINGS.heatmapEmpty}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <svg
              role="img"
              aria-label={SERVICE_VOLUME_STRINGS.heatmapTitle}
              viewBox={`0 0 ${gridW} ${gridH}`}
              width="100%"
              className="min-w-[420px] max-w-full"
            >
              {hours.map((h) =>
                h % 3 === 0 ? (
                  <text
                    key={`hour-${h}`}
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
              {labelDays.map((label, day) => (
                <text
                  key={`day-${day}`}
                  x={0}
                  y={labelRowH + day * (cellSize + gap) + cellSize / 2 + 3}
                  fontSize="9"
                  className="fill-muted-foreground"
                >
                  {label}
                </text>
              ))}
              {data.cells.map((row, day) =>
                row.map((value, hour) => {
                  const x = labelColW + hour * (cellSize + gap);
                  const y = labelRowH + day * (cellSize + gap);
                  const isHovered = hover && hover.day === day && hover.hour === hour;
                  return (
                    <rect
                      key={`cell-${day}-${hour}`}
                      x={x}
                      y={y}
                      width={cellSize}
                      height={cellSize}
                      rx={2}
                      className={`${intensityClass(value, data.maxCellValue)} ${
                        onCellClick ? "cursor-pointer" : ""
                      } transition-opacity ${isHovered ? "opacity-80" : ""}`}
                      stroke={isHovered ? "currentColor" : "none"}
                      strokeWidth={isHovered ? 1 : 0}
                      onMouseEnter={() => setHover({ day, hour, count: value })}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover({ day, hour, count: value })}
                      onBlur={() => setHover(null)}
                      onClick={() => onCellClick?.(day, hour)}
                      tabIndex={onCellClick ? 0 : -1}
                    >
                      <title>
                        {SERVICE_VOLUME_STRINGS.heatmapTooltip(
                          labelDays[day],
                          hour.toString().padStart(2, "0"),
                          value,
                        )}
                      </title>
                    </rect>
                  );
                }),
              )}
            </svg>
          </div>

          <div className="mt-auto flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <span aria-live="polite" className="min-h-[1em]">
              {hover &&
                SERVICE_VOLUME_STRINGS.heatmapTooltip(
                  labelDays[hover.day],
                  hover.hour.toString().padStart(2, "0"),
                  hover.count,
                )}
            </span>
            <div className="flex items-center gap-1.5">
              <span>{SERVICE_VOLUME_STRINGS.heatmapLegendMin}</span>
              <svg width="78" height="10" viewBox="0 0 78 10" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5].map((level) => (
                  <rect
                    key={level}
                    x={level * 13}
                    y={0}
                    width={11}
                    height={10}
                    rx={2}
                    className={legendIntensity(level)}
                  />
                ))}
              </svg>
              <span>{SERVICE_VOLUME_STRINGS.heatmapLegendMax}</span>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
